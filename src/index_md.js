const puppeteer = require("puppeteer");
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");
const TurndownService = require("turndown");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('url', {
    alias: 'u',
    description: 'GitBook URL to scrape',
    type: 'string',
  })
  .help()
  .alias('help', 'h')
  .argv;

// Default GitBook URL if not provided via command line
const URL_GITBOOK = argv.url || "https://docs.othentic.xyz/main";

// Function to sanitize a string for use as a folder name
function sanitizeFolderName(name) {
  return name
    .replace(/[^a-z0-9\s-]/gi, '') // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Remove consecutive hyphens
    .toLowerCase()                  // Convert to lowercase
    .trim();                        // Trim whitespace
}

// Function to extract site title from the homepage
async function extractSiteTitle(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle2" });
    
    // Try different selectors that might contain the site title
    const title = await page.evaluate(() => {
      // Try the document title first
      const docTitle = document.title;
      if (docTitle && !docTitle.includes('undefined')) {
        return docTitle.split('|')[0].trim(); // Often title has format "Page Title | Site Name"
      }
      
      // Try to find a heading or logo text that might contain the site name
      const siteTitle = document.querySelector('header h1, header .logo-text, .site-title');
      if (siteTitle) {
        return siteTitle.textContent.trim();
      }
      
      // Fallback to document title without filtering
      return document.title.trim();
    });
    
    return title || "GitBook-Documentation";
  } catch (error) {
    console.error("Error extracting site title:", error);
    return "GitBook-Documentation";
  }
}

// Function to fetch the sitemap XML and parse it
async function fetchSitemap(url) {
  try {
    const response = await axios.get(url);
    const sitemapXML = response.data;

    // Parse the XML sitemap into JSON
    const parsedSitemap = await xml2js.parseStringPromise(sitemapXML);
    const urls = parsedSitemap.urlset.url;

    return urls.map((url) => url.loc[0]); // Extract the 'loc' elements (URLs)
  } catch (error) {
    console.error("Error fetching or parsing sitemap:", error);
  }
}

// Function to extract page title
async function extractPageTitle(page) {
  return page.evaluate(() => {
    const titleElement = document.querySelector("h1");
    return titleElement ? titleElement.textContent.trim() : "Untitled Page";
  });
}

// Function to get clean extension from image URL
function getImageExtension(url) {
  // Extract the filename from the URL
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const filename = pathname.split('/').pop();
  
  // Extract extension from the filename
  const extension = path.extname(filename).split('?')[0].toLowerCase();
  
  // Return a default extension if none is found or it's invalid
  return extension && ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(extension) 
    ? extension 
    : '.png';
}

// Function to download an image and save it locally
async function downloadImage(imageUrl, outputPath) {
  try {
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(outputPath);
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Failed to download image: ${imageUrl}`, error);
    return null;
  }
}

// Function to extract markdown content with images from a page
async function extractMarkdownContent(page, url, outputDir, pageCounter) {
  try {
    // Set the viewport to a reasonable width for content extraction
    await page.setViewport({ width: 1280, height: 800 });

    // Go to the page and wait for it to load completely
    await page.goto(url, { waitUntil: "networkidle2" });

    // Create images directory if it doesn't exist
    const imagesDir = path.join(outputDir, "images");
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Remove navigation elements by setting display to 'none'
    await page.evaluate(() => {
      // Remove the AppBar element
      const appBar = document.querySelector("div.appBarClassName");
      if (appBar) {
        appBar.style.display = "none";
      }

      // Remove the element with class "scroll-nojump"
      const scrollNoJump = document.querySelector(".scroll-nojump");
      if (scrollNoJump) {
        scrollNoJump.style.display = "none";
      }

      // Remove the menu element
      const menu = document.querySelector(
        "aside.relative.group.flex.flex-col.basis-full.bg-light"
      );
      if (menu) {
        menu.style.display = "none";
      }

      // Remove the search button
      const searchButton = document.querySelector(
        "div.flex.md\\:w-56.grow-0.shrink-0.justify-self-end"
      );
      if (searchButton) {
        searchButton.style.display = "none";
      }

      // Remove the next button div
      const nextButton = document.querySelector(
        "div.flex.flex-col.md\\:flex-row.mt-6.gap-2.max-w-3xl.mx-auto.page-api-block\\:ml-0"
      );
      if (nextButton) {
        nextButton.style.display = "none";
      }

      // Remove the "Last updated" info
      const lastUpdatedInfo = document.querySelector(
        "div.flex.flex-row.items-center.mt-6.max-w-3xl.mx-auto.page-api-block\\:ml-0"
      );
      if (lastUpdatedInfo) {
        lastUpdatedInfo.style.display = "none";
      }
    });

    // Extract page title
    const pageTitle = await extractPageTitle(page);

    // Extract and download images
    const imageMap = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.map((img, index) => {
        const src = img.src;
        const alt = img.alt || `image-${index+1}`;
        
        // Extract any data attributes that might contain the real image source
        const dataSrc = img.getAttribute('data-src') || '';
        const srcset = img.getAttribute('srcset') || '';
        
        // Return all possible sources along with the alt text
        return { 
          originalSrc: src, 
          dataSrc: dataSrc,
          srcset: srcset,
          alt: alt 
        };
      });
    });

    // Process images with proper handling of query parameters
    for (let i = 0; i < imageMap.length; i++) {
      const image = imageMap[i];
      // Use the best available source (originalSrc, dataSrc, or first srcset item)
      let imageUrl = image.originalSrc;
      
      if (!imageUrl && image.dataSrc) {
        imageUrl = image.dataSrc;
      } else if (!imageUrl && image.srcset) {
        // Extract first URL from srcset if available
        const srcsetParts = image.srcset.split(',');
        if (srcsetParts.length > 0) {
          imageUrl = srcsetParts[0].trim().split(' ')[0];
        }
      }
      
      if (imageUrl) {
        // Get clean extension for the image
        const extension = getImageExtension(imageUrl);
        const imageFileName = `image_${pageCounter}_${i+1}${extension}`;
        const localImagePath = path.join(imagesDir, imageFileName);
        
        try {
          await downloadImage(imageUrl, localImagePath);
          
          // Update the image reference to use the local path
          imageMap[i].localPath = `./images/${imageFileName}`;
          // Store the base URL (without query params) for better matching later
          imageMap[i].baseUrl = imageUrl.split('?')[0];
        } catch (err) {
          console.error(`Failed to process image ${imageUrl}: ${err.message}`);
        }
      }
    }

    // Get the main content HTML
    const contentHTML = await page.evaluate(() => {
      // Select the main content container - adjust this selector based on the actual site structure
      const contentContainer = document.querySelector("main") || document.querySelector(".main-content");
      return contentContainer ? contentContainer.innerHTML : document.body.innerHTML;
    });

    // Convert HTML to Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
    
    // Customize turndown to handle code blocks better
    turndownService.addRule('codeBlocks', {
      filter: node => node.nodeName === 'PRE' && node.querySelector('code'),
      replacement: (content, node) => {
        const code = node.querySelector('code');
        const language = code.className.replace('language-', '');
        return `\n\`\`\`${language}\n${code.textContent}\n\`\`\`\n\n`;
      }
    });

    let markdown = turndownService.turndown(contentHTML);

    // Replace image references in the markdown
    for (const image of imageMap) {
      if (image.localPath) {
        try {
          // Try several approaches to replace image references:
          
          // 1. If we have the original URL, use it for replacement
          if (image.originalSrc) {
            const originalSrcEncoded = image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern1 = new RegExp(`!\\[(.*?)\\]\\(${originalSrcEncoded}\\)`, 'g');
            markdown = markdown.replace(pattern1, `![${image.alt}](${image.localPath})`);
          }
          
          // 2. Try with the base URL (URL without query parameters)
          if (image.baseUrl) {
            const baseUrlEncoded = image.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern2 = new RegExp(`!\\[(.*?)\\]\\(${baseUrlEncoded}[^)]*\\)`, 'g');
            markdown = markdown.replace(pattern2, `![${image.alt}](${image.localPath})`);
          }
          
          // 3. Try dataSrc if available
          if (image.dataSrc) {
            const dataSrcEncoded = image.dataSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern3 = new RegExp(`!\\[(.*?)\\]\\(${dataSrcEncoded}[^)]*\\)`, 'g');
            markdown = markdown.replace(pattern3, `![${image.alt}](${image.localPath})`);
          }
          
          // 4. Look for image filename in markdown (for cases where the path is different but filename is same)
          if (image.baseUrl) {
            const filename = image.baseUrl.split('/').pop();
            if (filename && filename.length > 3) {  // Ensure we have a meaningful filename
              const filenameEncoded = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const pattern4 = new RegExp(`!\\[(.*?)\\]\\([^)]*${filenameEncoded}[^)]*\\)`, 'g');
              markdown = markdown.replace(pattern4, `![${image.alt}](${image.localPath})`);
            }
          }
          
        } catch (error) {
          console.error(`Error replacing image reference: ${error.message}`);
        }
      }
    }

    // Add a title to the markdown file
    const fullMarkdown = `# ${pageTitle}\n\n${markdown}`;

    return fullMarkdown;
  } catch (error) {
    console.error(`Failed to extract markdown for: ${url}`, error);
    return `# Error Extracting Content\n\nFailed to extract content from ${url}. Error: ${error.message}`;
  }
}

// Function to group URLs based on their categories (like 'settings', 'android')
function categorizeUrl(url) {
  const parts = url.split("/");
  if (parts.length < 5) {
    console.error(`URL structure is incorrect: ${url}`);
    return "unknown"; // Return a fallback category
  }
  const category = parts[4]; // Assuming categories are the 5th part of the URL
  return category; // Return the category name (e.g., 'settings', 'android')
}

// Function to get a clean filename from the URL
function getFilenameFromUrl(url) {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const parts = pathname.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  
  // Clean up the filename and ensure it's valid
  return lastPart ? 
    lastPart.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 
    'index';
}

// Main function to run the script
async function run() {
  console.log(`Starting to scrape GitBook site: ${URL_GITBOOK}`);
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Extract the site title to use as the output folder name
  const siteTitle = await extractSiteTitle(page, URL_GITBOOK);
  const outputFolderName = sanitizeFolderName(siteTitle);
  console.log(`Site title detected: "${siteTitle}"`);
  console.log(`Using output folder: "${outputFolderName}"`);
  
  const sitemapUrl = `${URL_GITBOOK}/sitemap-pages.xml`; // Sitemap URL
  const saveDir = `./markdown/${outputFolderName}`; // Directory where markdown files will be saved

  // Create the output directory if it doesn't exist
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  // Fetch the sitemap URLs
  const urls = await fetchSitemap(sitemapUrl);
  if (!urls || urls.length === 0) {
    console.error("No URLs found in sitemap. Check if the sitemap URL is correct.");
    await browser.close();
    return;
  }
  
  console.log(`Found ${urls.length} pages to process`);

  // Initialize the page counter
  let pageCounter = 1;

  // Loop through each URL in the sitemap
  for (const url of urls) {
    // Determine the category based on the URL
    const category = categorizeUrl(url);
    const categoryDir = path.join(saveDir, category);

    // Create a folder for the category if it doesn't exist
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    // Generate a meaningful filename for the markdown file
    const baseName = getFilenameFromUrl(url);
    const mdFileName = `${baseName}.md`;
    const mdPath = path.join(categoryDir, mdFileName);

    console.log(`Processing page ${pageCounter}/${urls.length}: ${url}`);
    
    // Extract markdown content and save images
    const markdownContent = await extractMarkdownContent(page, url, categoryDir, pageCounter);
    
    // Write the markdown content to a file
    fs.writeFileSync(mdPath, markdownContent);
    
    console.log(`Saved markdown for: ${url} at ${mdPath}`);

    // Increment the page counter
    pageCounter++;
  }

  console.log(`Conversion complete! ${pageCounter-1} pages processed.`);
  console.log(`Output saved to: ${path.resolve(saveDir)}`);
  
  await browser.close();
}

run().catch(console.error);

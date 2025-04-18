![Gitbook to PDF Converter](https://i.suar.me/7GV8m)

# Gitbook Page to PDF & PNG Converter

Hi, I'm **Mouad Zizi**, a Flutter & Full Stack Developer. You can find more about me at [mouadzizi.com](https://mouadzizi.com).  
I created this script because there is no straightforward way to download a Gitbook as a PDF unless you have a premium plan.

With this Node.js script, you can simply provide the URL of your Gitbook sitemap, and it will do all the work for you!  
The script will generate **PDFs** and **PNG images** for each page, organizing them in a structured directory format like this:

```
menu_data/
    intro/
    page1.png
    page1.pdf
    page2.png
    page2.pdf
another_menu/
    page3.png
    page3.pdf
    page4.png
    page4.pdf
```

---

# 🚀 How to Use This Project

1. Clone the project and don't forget to give it a ⭐!
2. Install the dependencies:

```
npm install
```

3. To generate PDFs, run:

```

node src/index.js

```

4. To generate PNG images, run:

```

node src/index_png.js

```

5. Change it to your Gitbook URL:

```

You'll find this at the top of `src/index.js` or `src/index_png.js`:
const URL_GITBOOK = "https://your-gitbook.url/sub";

```

---

## 💡 Feel Free to Contribute

Feel free to fork this project and use it however you'd like!
Contributions are always welcome. If you have improvements or suggestions, open a pull request!

---

Thanks for using this script! 😊
Happy converting!

## Sky's Notes

- [x] Update README
- [x] Adapt for Othentic Docs
- [x] Add utility to convert to Markdown
- [ ] Add utility to track changes on docs and update Markdown saved earlier

---

# Gitbook to Markdown Converter

This tool scrapes GitBook documentation websites and converts the content to Markdown files with locally saved images.

## Features

- Extracts content from GitBook pages and converts to Markdown format
- Downloads and locally saves all images referenced in the content
- Updates image references in Markdown to point to local images
- Organizes content by categories based on URL structure
- Preserves code blocks with proper syntax highlighting
- Uses meaningful filenames based on the URL structure
- Accepts GitBook URL as a command-line parameter
- Uses the site title to name the output folder

## Configuration

You can specify the GitBook URL in two ways:

1. Via command-line argument:
   ```bash
   node src/index_md.js --url https://your-gitbook.com
   # or using the short form
   node src/index_md.js -u https://your-gitbook.com
   ```

2. By editing the default URL in the script:
   ```javascript
   const URL_GITBOOK = "https://docs.othentic.xyz/main";
   ```

## Usage

Run the script with npm:

```bash
# Using the npm script
npm run convert -- --url https://your-gitbook.com

# Or directly
node src/index_md.js --url https://your-gitbook.com
```

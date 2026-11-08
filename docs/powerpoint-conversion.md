# PowerPoint Conversion

## Requirements

PowerPoint rendering uses LibreOffice in headless mode.

- **macOS:** Install LibreOffice: `brew install --cask libreoffice`.
- **Windows:** Install [LibreOffice](https://www.libreoffice.org/download/download-libreoffice/).
- **Linux:** Install LibreOffice Impress: `sudo apt install libreoffice-impress`.

Restart MyPDF after installation. MyPDF does not open or automate Microsoft PowerPoint.

## Usage

1. Open **PowerPoint to PDF**.
2. Add one or more `.ppt` or `.pptx` files.
3. Choose an output:
   - **Electronic PDF:** compressed for sharing and screens.
   - **Print PDF:** higher quality for printing.
   - **Flattened PowerPoint:** each slide becomes one non-editable image that fills the complete slide.
4. Process and choose an output location.

One input produces one PDF or PPTX. Multiple inputs produce one ZIP archive.
All conversion is local.

## Limitations

- Animations, transitions, audio, video, and interactive elements are not preserved in PDF or flattened output.
- Missing fonts may change layout.
- LibreOffice output can differ slightly from Microsoft PowerPoint rendering.

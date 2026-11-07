# PowerPoint Conversion

## Requirements

PowerPoint rendering requires an installed presentation application.

- **macOS:** Microsoft PowerPoint is used when installed; LibreOffice is the fallback.
- **Windows:** Install [LibreOffice](https://www.libreoffice.org/download/download-libreoffice/).
- **Linux:** Install LibreOffice Impress: `sudo apt install libreoffice-impress`.
- **macOS LibreOffice fallback:** `brew install --cask libreoffice`.

Restart MyPDF after installation. On the first macOS conversion, allow Electron
or Python to control Microsoft PowerPoint when prompted.

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

- Microsoft PowerPoint may briefly open on macOS.
- Animations, transitions, audio, video, and interactive elements are not preserved in PDF or flattened output.
- Missing fonts may change layout.
- LibreOffice output can differ slightly from Microsoft PowerPoint rendering.

# Word Conversion

## Requirements

Word rendering requires an installed document application.

- **macOS:** Microsoft Word is used when installed; LibreOffice is the fallback.
- **Windows:** Install [LibreOffice](https://www.libreoffice.org/download/download-libreoffice/).
- **Linux:** Install LibreOffice Writer: `sudo apt install libreoffice-writer`.
- **macOS LibreOffice fallback:** `brew install --cask libreoffice`.

Restart MyPDF after installation. On the first macOS conversion, allow Electron
or Python to control Microsoft Word when prompted.

## Usage

1. Open **Word to PDF**.
2. Add one or more `.doc` or `.docx` files.
3. Choose an output:
   - **Electronic PDF:** compressed locally for sharing, screens, and accessibility.
   - **Print PDF:** higher quality for printing.
4. Process and choose an output location.

One input produces one PDF. Multiple inputs produce one ZIP archive. All
conversion is local; the electronic option does not use Microsoft online services.

## Limitations

- Microsoft Word may briefly open on macOS.
- Missing fonts may change layout and pagination.
- LibreOffice output can differ slightly from Microsoft Word rendering.
- Comments, tracked changes, and hidden content follow the rendering application's current print behavior.

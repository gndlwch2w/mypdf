"""Regression tests for MIME validation in Windows frozen builds."""

import asyncio
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import UploadFile

from app.exceptions.custom_exceptions import InvalidFileError
from app.utils.validators import FileValidator


class FileSignatureTests(unittest.TestCase):
    def test_supported_signatures(self):
        examples = {
            "application/pdf": b"%PDF-1.7\n",
            "image/jpeg": b"\xff\xd8\xff\xe0",
            "image/png": b"\x89PNG\r\n\x1a\n",
            "image/gif": b"GIF89a",
            "image/bmp": b"BM" + bytes(20),
            "image/tiff": b"II*\x00" + bytes(12),
            "image/webp": b"RIFF" + bytes(4) + b"WEBP",
        }
        for expected, data in examples.items():
            with self.subTest(expected=expected):
                self.assertEqual(FileValidator._detect_signature_mime(data), expected)

    def test_rejects_non_pdf_when_magic_is_unavailable(self):
        upload = UploadFile(file=io.BytesIO(b"plain text"), filename="file.pdf")
        with patch("app.utils.validators.MAGIC_AVAILABLE", False):
            with self.assertRaises(InvalidFileError):
                asyncio.run(FileValidator.validate_pdf_file(upload))

    def test_accepts_pdf_when_magic_is_unavailable(self):
        upload = UploadFile(file=io.BytesIO(b"%PDF-1.4\n"), filename="file.pdf")
        with patch("app.utils.validators.MAGIC_AVAILABLE", False):
            self.assertEqual(
                asyncio.run(FileValidator.validate_pdf_file(upload)),
                b"%PDF-1.4\n",
            )


if __name__ == "__main__":
    unittest.main()

import io
from pypdf import PdfWriter
from app.services.pdf_service import extract_text

def _one_page_pdf_bytes() -> bytes:
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    buf = io.BytesIO(); w.write(buf); return buf.getvalue()

def test_extract_text_returns_string():
    text = extract_text(_one_page_pdf_bytes())
    assert isinstance(text, str)

def test_extract_text_rejects_garbage():
    try:
        extract_text(b"not a pdf")
        assert False, "should have raised"
    except ValueError:
        pass

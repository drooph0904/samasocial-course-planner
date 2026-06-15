"""Extract text from an uploaded syllabus PDF."""
import io
from pypdf import PdfReader
from pypdf.errors import PdfReadError


def extract_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except (PdfReadError, Exception) as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc

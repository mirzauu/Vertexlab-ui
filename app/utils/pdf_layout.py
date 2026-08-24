"""
PDF Layout and Typography Extraction Utility.
Extracts exact page dimensions, fonts, line spacing, margins, line numbers,
indentations, and vertical borders from uploaded legal transcript PDFs using PyMuPDF.
"""

import math
import logging
from collections import Counter
from typing import Union
import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


def map_to_standard_font(font_name: str) -> str:
    """
    Map an extracted PDF font name to a PyMuPDF / standard PDF base-14 font.
    """
    name_lower = font_name.lower().replace("-", "").replace(" ", "").replace("_", "")
    
    if "courier" in name_lower or "typewriter" in name_lower or "mono" in name_lower or "consolas" in name_lower:
        if "bold" in name_lower and ("italic" in name_lower or "oblique" in name_lower):
            return "courier-boldoblique"
        elif "bold" in name_lower:
            return "courier-bold"
        elif "italic" in name_lower or "oblique" in name_lower:
            return "courier-oblique"
        return "courier"
    elif "times" in name_lower or "roman" in name_lower or "georgia" in name_lower or "garamond" in name_lower:
        if "bold" in name_lower and ("italic" in name_lower or "oblique" in name_lower):
            return "times-bolditalic"
        elif "bold" in name_lower:
            return "times-bold"
        elif "italic" in name_lower or "oblique" in name_lower:
            return "times-italic"
        return "times-roman"
    elif "arial" in name_lower or "helvetica" in name_lower or "sans" in name_lower:
        if "bold" in name_lower and ("italic" in name_lower or "oblique" in name_lower):
            return "helvetica-boldoblique"
        elif "bold" in name_lower:
            return "helvetica-bold"
        elif "italic" in name_lower or "oblique" in name_lower:
            return "helvetica-oblique"
        return "helvetica"
    
    # Default to standard legal monospace
    return "courier"


def extract_pdf_layout_profile(pdf_source: Union[str, bytes]) -> dict:
    """
    Analyzes a PDF document and returns a detailed layout profile including:
    - Page dimensions (width, height)
    - Font properties (dominant font name, font size, base font mapping)
    - Line metrics (line height, line number count, top/bottom margins)
    - Margin & alignment metrics (left, right, line number column X, text start X)
    - Indentations (Q/A indent, speaker indent, continuation indent)
    - Vertical lines/borders (presence and coordinates)
    - Page number positioning
    """
    default_profile = {
        "page_width": 612.0,
        "page_height": 792.0,
        "font_name": "courier",
        "font_family": "Courier",
        "font_size": 10.0,
        "line_number_font_size": 10.0,
        "line_height": 24.8,
        "max_lines_per_page": 25,
        "top_margin": 100.0,
        "bottom_margin": 72.0,
        "left_margin": 79.0,
        "right_margin": 79.0,
        "line_number_width": 22.0,
        "line_number_x": 90.0,
        "text_start_x": 113.0,
        "q_start_x": 160.0,
        "a_start_x": 160.0,
        "speaker_start_x": 160.0,
        "vertical_lines": [
            {"x": 105.0, "top": 100.0, "bottom": 720.0},
            {"x": 107.0, "top": 100.0, "bottom": 720.0},
            {"x": 537.0, "top": 100.0, "bottom": 720.0}
        ],
        "page_number": {
            "position": "top-right",
            "x": 513.0,
            "y": 100.0,
            "format": "number"
        }
    }

    try:
        if isinstance(pdf_source, bytes):
            doc = fitz.open(stream=pdf_source, filetype="pdf")
        elif isinstance(pdf_source, str) and (pdf_source.startswith("http://") or pdf_source.startswith("https://")):
            import httpx
            resp = httpx.get(pdf_source, timeout=60.0)
            resp.raise_for_status()
            doc = fitz.open(stream=resp.content, filetype="pdf")
        else:
            doc = fitz.open(pdf_source)

        if len(doc) == 0:
            return default_profile

        # Gather sample pages (skip page 0 if multi-page to avoid potential non-transcript cover page)
        start_page = 1 if len(doc) > 1 else 0
        sample_pages = [doc[i] for i in range(start_page, min(start_page + 6, len(doc)))]

        # 1. Page dimensions
        first_page = sample_pages[0]
        page_width = float(first_page.rect.width)
        page_height = float(first_page.rect.height)

        # 2. Font & Span analysis
        fonts_counter = Counter()
        sizes_counter = Counter()
        line_num_sizes = Counter()
        
        line_num_x_list = []
        body_start_x_list = []
        body_end_x_list = []
        y_positions_per_page = []
        drawing_lines = []

        q_starts = []
        a_starts = []
        speaker_starts = []

        for p in sample_pages:
            p_drawings = p.get_drawings()
            for draw in p_drawings:
                rect = draw.get("rect")
                if rect:
                    w = rect.width
                    h = rect.height
                    # Detect vertical rules (thin width, tall height)
                    if w < 5.0 and h > page_height * 0.4:
                        drawing_lines.append({
                            "x": round(float(rect.x0), 1),
                            "top": round(float(rect.y0), 1),
                            "bottom": round(float(rect.y1), 1)
                        })

            text_dict = p.get_text("dict")
            page_line_y_list = []

            for b in text_dict.get("blocks", []):
                if "lines" not in b:
                    continue
                for line in b["lines"]:
                    spans = line.get("spans", [])
                    if not spans:
                        continue

                    full_line_text = "".join(s.get("text", "") for s in spans).strip()
                    if not full_line_text:
                        continue

                    first_span = spans[0]
                    font_name = first_span.get("font", "Courier")
                    font_size = round(float(first_span.get("size", 10.0)), 1)
                    bbox = line.get("bbox", (0, 0, 0, 0))
                    x0, y0, x1, y1 = bbox

                    # Check if line is a line number down the margin (e.g. 1 to 25)
                    if full_line_text.isdigit() and 1 <= int(full_line_text) <= 30 and x0 < page_width * 0.3:
                        line_num_sizes[font_size] += 1
                        line_num_x_list.append(x0)
                        page_line_y_list.append((int(full_line_text), y0, y1))
                    else:
                        # Exclude headers / footers from dominant body font calculation
                        is_header_footer = (y0 < page_height * 0.08) or (y1 > page_height * 0.92)
                        if not is_header_footer:
                            fonts_counter[font_name] += len(full_line_text)
                            sizes_counter[font_size] += len(full_line_text)
                            body_start_x_list.append(x0)
                            body_end_x_list.append(x1)

                            # Track indentation for Q, A, and speakers
                            if full_line_text.startswith("Q.") or full_line_text.startswith("Q "):
                                q_starts.append(x0)
                            elif full_line_text.startswith("A.") or full_line_text.startswith("A "):
                                a_starts.append(x0)
                            elif ":" in full_line_text and full_line_text.split(":")[0].isupper():
                                speaker_starts.append(x0)

            if page_line_y_list:
                y_positions_per_page.append(sorted(page_line_y_list, key=lambda x: x[0]))

        doc.close()

        # Dominant font & size
        dominant_font_raw = fonts_counter.most_common(1)[0][0] if fonts_counter else "Courier"
        mapped_font_name = map_to_standard_font(dominant_font_raw)
        dominant_font_size = sizes_counter.most_common(1)[0][0] if sizes_counter else 10.0
        line_num_size = line_num_sizes.most_common(1)[0][0] if line_num_sizes else dominant_font_size

        # Line spacing & line counts
        line_heights = []
        max_lines_detected = 25
        top_y_list = []
        bottom_y_list = []

        for page_lines in y_positions_per_page:
            if len(page_lines) > 1:
                max_lines_detected = max(max_lines_detected, page_lines[-1][0])
                top_y_list.append(page_lines[0][1])
                bottom_y_list.append(page_lines[-1][2])
                for i in range(len(page_lines) - 1):
                    delta = page_lines[i + 1][1] - page_lines[i][1]
                    if 10.0 <= delta <= 50.0:
                        line_heights.append(delta)

        if line_heights:
            line_heights_sorted = sorted(line_heights)
            line_height = round(float(line_heights_sorted[len(line_heights_sorted) // 2]), 2)
        else:
            line_height = round((page_height - 172.0) / max_lines_detected, 2)

        top_margin = round(float(min(top_y_list)), 1) if top_y_list else 100.0
        bottom_margin = round(page_height - float(max(bottom_y_list)), 1) if bottom_y_list else 72.0

        # Margin and X positions
        line_num_x = round(float(min(line_num_x_list)), 1) if line_num_x_list else 79.0
        left_margin = max(30.0, line_num_x - 10.0)

        if body_start_x_list:
            body_start_sorted = sorted(body_start_x_list)
            # 10th percentile for text start x
            text_start_x = round(float(body_start_sorted[int(len(body_start_sorted) * 0.1)]), 1)
        else:
            text_start_x = line_num_x + 30.0

        if body_end_x_list:
            body_end_sorted = sorted(body_end_x_list)
            # 90th percentile for body right edge
            body_max_x = float(body_end_sorted[int(len(body_end_sorted) * 0.9)])
            right_margin = max(40.0, round(page_width - body_max_x, 1))
        else:
            right_margin = 79.0

        # Indentations
        q_start_x = round(float(sorted(q_starts)[len(q_starts)//2]), 1) if q_starts else text_start_x + 20.0
        a_start_x = round(float(sorted(a_starts)[len(a_starts)//2]), 1) if a_starts else text_start_x + 20.0
        speaker_start_x = round(float(sorted(speaker_starts)[len(speaker_starts)//2]), 1) if speaker_starts else text_start_x + 40.0

        # Deduplicate detected vertical lines
        unique_v_lines = []
        seen_x = set()
        for vl in sorted(drawing_lines, key=lambda l: l["x"]):
            x_key = round(vl["x"], 0)
            if x_key not in seen_x:
                seen_x.add(x_key)
                unique_v_lines.append(vl)

        # If no explicit vector drawings found, synthesize based on standard deposition layout margins
        if not unique_v_lines:
            line_x1 = round(line_num_x + 16.0, 1)
            line_x2 = round(line_num_x + 18.0, 1)
            right_line_x = round(page_width - right_margin + 4.0, 1)
            unique_v_lines = [
                {"x": line_x1, "top": top_margin, "bottom": page_height - bottom_margin},
                {"x": line_x2, "top": top_margin, "bottom": page_height - bottom_margin},
                {"x": right_line_x, "top": top_margin, "bottom": page_height - bottom_margin}
            ]

        profile = {
            "page_width": page_width,
            "page_height": page_height,
            "font_name": mapped_font_name,
            "font_family": dominant_font_raw,
            "font_size": dominant_font_size,
            "line_number_font_size": line_num_size,
            "line_height": line_height,
            "max_lines_per_page": int(max_lines_detected),
            "top_margin": top_margin,
            "bottom_margin": bottom_margin,
            "left_margin": left_margin,
            "right_margin": right_margin,
            "line_number_width": max(20.0, text_start_x - line_num_x - 10.0),
            "line_number_x": line_num_x,
            "text_start_x": text_start_x,
            "q_start_x": q_start_x,
            "a_start_x": a_start_x,
            "speaker_start_x": speaker_start_x,
            "vertical_lines": unique_v_lines,
            "page_number": {
                "position": "top-right",
                "x": page_width - right_margin - 10.0,
                "y": max(25.0, top_margin - line_height),
                "format": "number"
            }
        }

        logger.info(f"Extracted PDF layout profile: {profile['page_width']}x{profile['page_height']}, "
                    f"font={profile['font_name']} ({profile['font_size']}pt), "
                    f"line_height={profile['line_height']}, lines={profile['max_lines_per_page']}")
        return profile

    except Exception as e:
        logger.error(f"Error extracting PDF layout profile: {e}. Falling back to default layout.", exc_info=True)
        return default_profile

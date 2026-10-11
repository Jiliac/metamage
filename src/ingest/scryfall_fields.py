"""Pure Scryfall card-object -> ``cards`` column mapping (KTD2).

One extractor shared by ingest (``get_or_create_card``) and the bulk backfill,
so the two writers can never disagree about how a Scryfall card object maps to
the KTD1 columns on ``cards``.
"""

from typing import Any, Dict, Optional


def extract_scryfall_fields(data: Dict[str, Any]) -> Dict[str, Optional[Any]]:
    """Map one Scryfall card object to the KTD1 card columns.

    Rules (KTD2):

    - Top-level ``image_uris`` win when present (normal, split, adventure,
      flip, prototype, meld parts); otherwise the face images of
      ``card_faces[0]``/``card_faces[1]`` are used (transform, modal_dfc,
      battle).
    - Type line and mana cost come from ``card_faces[0]`` when faces exist,
      except split cards, which keep the full top-level ``mana_cost``
      (e.g. ``{R} // {2}{R}``).
    - ``display_name`` is Scryfall's top-level ``name``.

    Missing optional fields yield nulls; malformed input never raises.
    """
    faces = data.get("card_faces") or []
    first_face: Dict[str, Any] = faces[0] if faces else {}
    second_face: Dict[str, Any] = faces[1] if len(faces) > 1 else {}

    top_images = data.get("image_uris") or {}
    if top_images:
        image_normal = top_images.get("normal")
        image_back = None
    else:
        image_normal = (first_face.get("image_uris") or {}).get("normal")
        image_back = (second_face.get("image_uris") or {}).get("normal")

    if first_face:
        type_line = first_face.get("type_line")
        # Split cards keep the combined top-level cost; every other faced
        # layout takes the front face's cost.
        if data.get("layout") == "split":
            mana_cost = data.get("mana_cost")
        else:
            mana_cost = first_face.get("mana_cost")
    else:
        type_line = data.get("type_line")
        mana_cost = data.get("mana_cost")

    return {
        "display_name": data.get("name"),
        "type_line": type_line,
        "mana_cost": mana_cost,
        "cmc": data.get("cmc"),
        "image_normal": image_normal,
        "image_back": image_back,
        "scryfall_uri": data.get("scryfall_uri"),
        "scryfall_id": data.get("id"),
    }
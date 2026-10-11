"""scripts/update_card_colors.py: bulk download (timeout, streaming, errors).

``urlopen`` is faked; no network access.
"""

import gzip
import importlib.util
import io
import json
import sys
import urllib.error
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "update_card_colors_download", ROOT / "scripts" / "update_card_colors.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ucc = _load_module()

META_URL = "https://api.scryfall.com/bulk-data"
DATA_URL = "https://data.scryfall.io/oracle-cards/oracle-cards.jsonl.gz"
META = {"data": [{"type": "oracle_cards", "jsonl_download_uri": DATA_URL}]}
CARDS = [{"name": "Lightning Bolt"}, {"name": "Kitchen Finks"}]


class StreamOnly(io.BytesIO):
    """A response body that refuses to be read whole."""

    def read(self, size=-1):
        assert size is not None and size > 0, "bulk body must be streamed"
        return super().read(size)


def _fake_urlopen(calls, responses):
    def fake(request, timeout=None):
        calls.append((request.full_url, timeout))
        response = responses[request.full_url]
        if isinstance(response, Exception):
            raise response
        return response()

    return fake


def _ok_responses():
    gz = gzip.compress(
        ("\n".join(json.dumps(card) for card in CARDS) + "\n").encode("utf-8")
    )
    return {
        META_URL: lambda: io.BytesIO(json.dumps(META).encode("utf-8")),
        DATA_URL: lambda: StreamOnly(gz),
    }


def test_download_streams_with_timeout(monkeypatch):
    calls = []
    monkeypatch.setattr(
        ucc.urllib.request, "urlopen", _fake_urlopen(calls, _ok_responses())
    )

    assert list(ucc.iter_cards(None)) == CARDS
    assert [url for url, _ in calls] == [META_URL, DATA_URL]
    assert all(timeout == ucc.DOWNLOAD_TIMEOUT for _, timeout in calls)


def test_http_error_becomes_download_error(monkeypatch):
    responses = _ok_responses()
    responses[DATA_URL] = urllib.error.HTTPError(
        DATA_URL, 503, "Service Unavailable", {}, None
    )
    monkeypatch.setattr(ucc.urllib.request, "urlopen", _fake_urlopen([], responses))

    with pytest.raises(ucc.DownloadError, match="HTTP 503 Service Unavailable"):
        list(ucc.iter_cards(None))


def test_url_error_becomes_download_error(monkeypatch):
    responses = {META_URL: urllib.error.URLError(TimeoutError("timed out"))}
    monkeypatch.setattr(ucc.urllib.request, "urlopen", _fake_urlopen([], responses))

    with pytest.raises(ucc.DownloadError, match="timed out"):
        list(ucc.iter_cards(None))


def test_missing_oracle_cards_entry_becomes_download_error(monkeypatch):
    responses = {META_URL: lambda: io.BytesIO(b'{"data": []}')}
    monkeypatch.setattr(ucc.urllib.request, "urlopen", _fake_urlopen([], responses))

    with pytest.raises(ucc.DownloadError, match="oracle_cards"):
        list(ucc.iter_cards(None))


def test_main_prints_download_error_without_traceback(
    tmp_path, monkeypatch, capsys
):
    colors = tmp_path / "card_colors.json"
    colors.write_text('{"Lands": [], "NonLands": []}', encoding="utf-8")
    responses = {META_URL: urllib.error.URLError("nodename nor servname provided")}
    monkeypatch.setattr(ucc.urllib.request, "urlopen", _fake_urlopen([], responses))
    monkeypatch.setattr(sys, "argv", ["update_card_colors.py", "--colors", str(colors)])

    assert ucc.main() == 1
    err = capsys.readouterr().err
    assert "error:" in err
    assert "nodename nor servname provided" in err
    assert "Traceback" not in err

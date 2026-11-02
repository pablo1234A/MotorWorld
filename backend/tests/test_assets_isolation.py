from .conftest import upload


async def test_upload_inspects_media(client, media_dir):
    img = await upload(client, media_dir / "img.png")
    assert img["kind"] == "image" and img["width"] == 512 and img["height"] == 384 and img["thumbnail_url"]
    vid = await upload(client, media_dir / "a.mp4")
    assert vid["kind"] == "video" and vid["has_audio"] and abs(vid["duration"] - 3) < 0.2 and vid["width"] == 640
    aud = await upload(client, media_dir / "tone.wav")
    assert aud["kind"] == "audio" and abs(aud["duration"] - 4) < 0.2
    r = await client.get(img["url"])
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    r = await client.get(img["download_url"])
    assert "attachment" in r.headers["content-disposition"]
    # range requests (video seeking)
    r = await client.get(vid["url"], headers={"range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100
    t = await client.get(vid["thumbnail_url"])
    assert t.status_code == 200
    lst = (await client.get("/api/assets?kind=video")).json()
    assert lst["total"] == 1


async def test_rejects_disguised_and_unknown_files(client, media_dir):
    with (media_dir / "fake.png").open("rb") as fh:
        r = await client.post("/api/assets", files={"file": ("foto.png", fh, "image/png")})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "invalid_media"
    r = await client.post("/api/assets", files={"file": ("x.exe", b"MZ\x90\x00" + b"\x00" * 200, "image/png")})
    assert r.status_code == 400


async def test_mask_upload_is_normalised(client, media_dir):
    from io import BytesIO

    from PIL import Image

    img = await upload(client, media_dir / "img.png")
    m = Image.new("RGBA", (100, 75), (0, 0, 0, 0))
    m.paste((255, 255, 255, 255), (10, 10, 50, 50))
    b = BytesIO()
    m.save(b, "PNG")
    r = await client.post(f"/api/assets/{img['id']}/mask", files={"file": ("mask.png", b.getvalue(), "image/png")})
    assert r.status_code == 201
    mask = r.json()
    assert mask["source"] == "mask" and mask["width"] == 512 and mask["height"] == 384 and mask["parent_id"] == img["id"]
    # masks are hidden from the library by default
    assert all(a["source"] != "mask" for a in (await client.get("/api/assets")).json()["items"])


async def test_users_cannot_access_each_others_data(client, client_b, media_dir):
    a = await upload(client, media_dir / "img.png")
    p = (await client.post("/api/projects", json={"name": "Privado"})).json()
    f = (await client.post("/api/films", json={"title": "Secreta"})).json()
    t = (await client.post("/api/timelines", json={"name": "Montaje A"})).json()
    gen = (await client.post("/api/generations", json={"task": "local_image_op", "model_id": "local-image", "params": {"ops": [{"op": "grayscale"}]},
                                                      "inputs": {"image": a["id"]}})).json()
    for url in (f"/api/assets/{a['id']}", a["url"], a["thumbnail_url"], f"/api/assets/{a['id']}/lineage", f"/api/projects/{p['id']}",
                f"/api/films/{f['id']}", f"/api/timelines/{t['id']}", f"/api/generations/{gen['id']}", f"/api/timelines/{t['id']}/export.otio"):
        r = await client_b.get(url)
        assert r.status_code in (404,), (url, r.status_code)
    assert (await client_b.patch(f"/api/assets/{a['id']}", json={"is_favorite": True})).status_code == 404
    assert (await client_b.delete(f"/api/assets/{a['id']}")).status_code == 404
    assert (await client_b.delete(f"/api/projects/{p['id']}")).status_code == 404
    assert (await client_b.post(f"/api/generations/{gen['id']}/retry")).status_code == 404
    assert (await client_b.post(f"/api/assets/{a['id']}/media-token")).status_code == 404
    # cannot use another user's asset as an input
    r = await client_b.post("/api/generations", json={"task": "local_image_op", "model_id": "local-image", "params": {"ops": []},
                                                      "inputs": {"image": a["id"]}})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "input_not_found"
    # cannot reference another user's asset in a timeline
    r = await client_b.post("/api/timelines", json={"name": "x", "data": {"tracks": [{"kind": "video", "clips": [{"asset_id": a["id"]}]}]}})
    assert r.status_code == 400
    # nor list it
    assert (await client_b.get("/api/assets")).json()["total"] == 0
    # a media token issued to A for asset X cannot open asset Y
    other = await upload(client, media_dir / "tone.wav")
    tok = (await client.post(f"/api/assets/{a['id']}/media-token")).json()["token"]
    client_b.cookies.clear()
    assert (await client_b.get(f"/api/assets/{a['id']}/file?token={tok}")).status_code == 200
    assert (await client_b.get(f"/api/assets/{other['id']}/file?token={tok}")).status_code == 401


async def test_favorites_projects_and_delete(client, media_dir):
    a = await upload(client, media_dir / "img.png")
    p = (await client.post("/api/projects", json={"name": "Campaña", "kind": "ad"})).json()
    r = await client.patch(f"/api/assets/{a['id']}", json={"is_favorite": True, "project_id": p["id"], "name": "portada"})
    assert r.json()["is_favorite"] and r.json()["project_id"] == p["id"]
    favs = (await client.get("/api/assets?favorite=true")).json()
    assert favs["total"] == 1
    proj = (await client.get(f"/api/projects/{p['id']}")).json()
    assert proj["asset_count"] == 1
    assert (await client.delete(f"/api/assets/{a['id']}")).status_code == 200
    assert (await client.get(a["url"])).status_code == 404

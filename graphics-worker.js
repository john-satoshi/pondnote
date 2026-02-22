self.addEventListener("message", (event) => {
  const data = event.data || {};
  const id = data.id;
  const type = data.type;
  const payload = data.payload || {};
  if (!id || !type) return;

  if (type === "noise") {
    const size = Math.max(16, Math.min(256, payload.size || 96));
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { alpha: true });
    const image = ctx.createImageData(size, size);
    const out = image.data;
    for (let i = 0; i < out.length; i += 4) {
      const grain = 210 + Math.floor(Math.random() * 46);
      out[i] = grain;
      out[i + 1] = grain;
      out[i + 2] = grain;
      out[i + 3] = 35 + Math.floor(Math.random() * 55);
    }
    ctx.putImageData(image, 0, 0);
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id, type, bitmap }, [bitmap]);
    return;
  }

  if (type === "sky") {
    const width = Math.max(64, payload.width || 512);
    const height = Math.max(64, payload.height || 512);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: false });

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#75acd6");
    sky.addColorStop(0.52, "#8ec0e4");
    sky.addColorStop(1, "#c2dded");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const cloudCount = Math.max(10, Math.floor(width / 110));
    for (let i = 0; i < cloudCount; i += 1) {
      const cx = Math.random() * width;
      const cy = Math.random() * height * 0.92;
      const size = 120 + Math.random() * 260;
      const lumps = 5 + Math.floor(Math.random() * 4);
      for (let j = 0; j < lumps; j += 1) {
        const ox = (Math.random() - 0.5) * size * 1.1;
        const oy = (Math.random() - 0.5) * size * 0.45;
        const rx = size * (0.18 + Math.random() * 0.24);
        const ry = size * (0.13 + Math.random() * 0.2);
        ctx.fillStyle = `rgba(255,255,255,${(0.22 + Math.random() * 0.18) * (0.5 + Math.random() * 0.5)})`;
        ctx.beginPath();
        ctx.ellipse(cx + ox, cy + oy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const light = ctx.createRadialGradient(width * 0.78, height * 0.2, 40, width * 0.78, height * 0.2, width * 0.5);
    light.addColorStop(0, "rgba(255,255,255,0.28)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);

    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id, type, bitmap }, [bitmap]);
  }
});

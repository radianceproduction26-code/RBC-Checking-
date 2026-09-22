/**
 * Generates synthetic realistic injection molded plastic parts
 * with brass threaded metal sleeves for initial master setup and live testing.
 * Configured specifically for 3 Metal Sleeves.
 */

export function generatePartImage({
  width = 640,
  height = 480,
  rotation = 0, // degrees
  translateX = 0,
  translateY = 0,
  scale = 1.0,
  sleeves = [
    { id: 1, x: 200, y: 180, radius: 25, present: true },
    { id: 2, x: 440, y: 180, radius: 25, present: true },
    { id: 3, x: 320, y: 315, radius: 25, present: true },
  ],
  backgroundType = 'shopfloor', // 'clean' | 'shopfloor'
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Draw Background
  if (backgroundType === 'shopfloor') {
    // Bright industrial workbench / anti-static mat texture
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, width * 0.7);
    bgGrad.addColorStop(0, '#e2e8f0');
    bgGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Grid lines for workbench calibration
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else {
    // Clean bright inspection stage background
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Transform context for part position & rotation
  ctx.save();
  ctx.translate(width / 2 + translateX, height / 2 + translateY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  // Center relative to master part center (320, 240)
  ctx.translate(-320, -240);

  // 3. Draw Injection Molded Plastic Component Body (3-Sleeve Triangle/Arch Structure)
  ctx.save();
  // Cast soft shadow on workbench
  ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 12;

  ctx.beginPath();
  // Ergonomic triangular mounting bracket with rounded lobes around the 3 sleeves
  ctx.moveTo(150, 150);
  ctx.lineTo(490, 150);
  ctx.arcTo(515, 150, 515, 210, 30);
  ctx.lineTo(460, 250);
  ctx.arcTo(370, 370, 320, 370, 35);
  ctx.lineTo(320, 370);
  ctx.arcTo(270, 370, 180, 250, 35);
  ctx.lineTo(125, 210);
  ctx.arcTo(125, 150, 150, 150, 30);
  ctx.closePath();

  // Dark matte polymer injection-molded plastic gradient
  const plasticGrad = ctx.createLinearGradient(130, 140, 510, 370);
  plasticGrad.addColorStop(0, '#334155');
  plasticGrad.addColorStop(0.5, '#1e293b');
  plasticGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = plasticGrad;
  ctx.fill();
  ctx.restore();

  // Molded parting line & outer chamfer
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Highlight ridge
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(155, 153);
  ctx.lineTo(485, 153);
  ctx.stroke();

  // Mold cavity structural stiffening ribs (Connecting the 3 sleeves)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(200, 180);
  ctx.lineTo(440, 180);
  ctx.lineTo(320, 315);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(200, 179);
  ctx.lineTo(440, 179);
  ctx.lineTo(320, 314);
  ctx.closePath();
  ctx.stroke();

  // Central molded hole / weight-reduction pocket
  ctx.beginPath();
  ctx.arc(320, 225, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#090d16';
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Molded part text
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PART: PL-BRKT-3X', 320, 272);
  ctx.font = '9px sans-serif';
  ctx.fillText('3-SLEEVE SPEC', 320, 285);

  // Molded Boss cylinders for each of the 3 sleeves
  sleeves.forEach((sleeve) => {
    const { x, y, radius, present } = sleeve;

    // Outer plastic boss ring (raised cylinder molded into the plastic)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius + 14, 0, Math.PI * 2);
    const bossGrad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius + 14);
    bossGrad.addColorStop(0, '#475569');
    bossGrad.addColorStop(0.8, '#1e293b');
    bossGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bossGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    if (present) {
      // 4A. BRASS / STEEL METAL SLEEVE INSERT PRESENT
      // Outer knurled brass bevel
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      const brassGrad = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, radius);
      brassGrad.addColorStop(0, '#fef08a'); // bright brass specular highlight
      brassGrad.addColorStop(0.3, '#eab308'); // warm golden brass
      brassGrad.addColorStop(0.7, '#b45309'); // deeper amber brass
      brassGrad.addColorStop(1, '#78350f'); // edge shadow
      ctx.fillStyle = brassGrad;
      ctx.fill();

      // Knurled teeth / concentric metallic tooling rings
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius - 6, 0, Math.PI * 2);
      ctx.stroke();

      // Radial metallic notches (teeth on outer circumference)
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
        ctx.beginPath();
        const r1 = radius - 5;
        const r2 = radius - 1;
        ctx.moveTo(x + Math.cos(angle) * r1, y + Math.sin(angle) * r1);
        ctx.lineTo(x + Math.cos(angle) * r2, y + Math.sin(angle) * r2);
        ctx.strokeStyle = angle % (Math.PI / 3) === 0 ? '#fef08a' : '#78350f';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Internal threaded bore (hollow center with metallic thread ridges)
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.52, 0, Math.PI * 2);
      const threadGrad = ctx.createRadialGradient(x, y, 1, x, y, radius * 0.52);
      threadGrad.addColorStop(0, '#0f0c08');
      threadGrad.addColorStop(0.7, '#451a03');
      threadGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = threadGrad;
      ctx.fill();

      // Thread helical spiral highlights
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.38, 0, Math.PI * 1.5);
      ctx.stroke();
    } else {
      // 4B. SLEEVE MISSING! (Empty molded plastic through-hole / core cavity)
      // Empty dark hole inside the plastic boss - NO metallic reflection, NO brass color!
      ctx.beginPath();
      ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
      const emptyGrad = ctx.createRadialGradient(x + 4, y + 4, 2, x, y, radius - 2);
      emptyGrad.addColorStop(0, '#05070a'); // dark void
      emptyGrad.addColorStop(0.8, '#0f172a');
      emptyGrad.addColorStop(1, '#1e293b'); // raw plastic hole edge
      ctx.fillStyle = emptyGrad;
      ctx.fill();

      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Unfinished plastic tooling marks inside cavity (matte and non-reflective)
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0f19';
      ctx.fill();
    }
  });

  ctx.restore();

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
    sleeves: sleeves.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      radius: s.radius,
    })),
  };
}

/**
 * Returns the standard default master part data with 3 sleeves
 */
export function getDefaultMasterPart() {
  const generated = generatePartImage({
    width: 640,
    height: 480,
    rotation: 0,
    translateX: 0,
    translateY: 0,
    backgroundType: 'clean',
    sleeves: [
      { id: 1, x: 200, y: 180, radius: 25, present: true },
      { id: 2, x: 440, y: 180, radius: 25, present: true },
      { id: 3, x: 320, y: 315, radius: 25, present: true },
    ],
  });

  return {
    id: 'default_bracket_3sleeve_part',
    name: 'Injection Molded Bracket (3-Sleeve)',
    partNumber: 'PL-BRKT-3X',
    imageUrl: generated.dataUrl,
    width: generated.width,
    height: generated.height,
    sleeves: generated.sleeves,
    updatedAt: new Date().toISOString(),
  };
}

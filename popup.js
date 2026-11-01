(async () => {
  const $ = id => document.getElementById(id);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname.replace(/^www\./, ''); } catch {}

  const S = { ...CC.DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  const save = patch => { Object.assign(S, patch); return chrome.storage.sync.set(patch); };

  $('host').textContent = host || 'page non compatible';
  $('enabled').checked = S.sites.includes(host);
  $('enabled').disabled = !host;
  $('enabled').onchange = async e => {
    const sites = new Set(S.sites);
    e.target.checked ? sites.add(host) : sites.delete(host);
    await save({ sites: [...sites] });
    chrome.tabs.reload(tab.id);
  };

  $('threshold').value = S.threshold;
  $('thVal').textContent = S.threshold + ' %';
  $('threshold').oninput = e => $('thVal').textContent = e.target.value + ' %';
  $('threshold').onchange = e => save({ threshold: +e.target.value });

  for (const [k, t] of Object.entries(CC.TYPES)) {
    if (!t.label) continue; // 'hors' : jamais analysé
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" value="${k}"> <span></span>`;
    l.lastChild.textContent = t.label;
    l.firstChild.checked = S.types.includes(k);
    l.firstChild.onchange = () => save({ types: [...document.querySelectorAll('#types input:checked')].map(i => i.value) });
    $('types').appendChild(l);
  }

  for (const [k, f] of Object.entries(CC.FIBERS)) {
    if (f.cat === 'nat') continue;
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" value="${k}"> <span></span>`;
    l.lastChild.textContent = f.label;
    l.firstChild.checked = S.bad.includes(k);
    l.firstChild.onchange = () => save({ bad: [...document.querySelectorAll('#synth input:checked, #art input:checked')].map(i => i.value) });
    $(f.cat).appendChild(l);
  }

  document.querySelector(`input[name=mode][value=${S.mode}]`).checked = true;
  document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => save({ mode: r.value }));
  $('badges').checked = S.badges;
  $('badges').onchange = e => save({ badges: e.target.checked });
  $('hideUnknown').checked = S.hideUnknown;
  $('hideUnknown').onchange = e => save({ hideUnknown: e.target.checked });

  $('clear').onclick = async () => {
    await chrome.storage.local.clear();
    $('clear').textContent = 'Cache vidé ✓';
    if (host && S.sites.includes(host)) chrome.tabs.reload(tab.id);
  };
})();

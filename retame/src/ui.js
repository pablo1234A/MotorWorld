/* =====================================================================
 * RÉTAME — piezas de interfaz compartidas (solo texto HTML, sin DOM).
 * Las usa el generador del sitio para el HTML estático y el navegador
 * para pintar sesiones y resultados: el marcado es idéntico en ambos.
 * =================================================================== */
function href(p) { return (CONFIG.basePath || "") + p; }
function catUrl(cat) { return href("/retos/" + cat + "/"); }
/* Página pública del reto si la tiene; si no (generados, en grupo), la
 * zona de juego. */
function challengeUrl(ch) {
  if (!ch.generated && catBySlug[ch.cat] && !catBySlug[ch.cat].hidden) return href("/retos/" + ch.cat + "/" + ch.slug + "/");
  return href("/juegos/?reto=" + encodeURIComponent(ch.slug));
}
function topicLabel(ch) { return ch.topic && TOPICS[ch.topic] ? TOPICS[ch.topic] : ""; }

function dots(n) {
  var s = ""; for (var i = 1; i <= 5; i++) s += "<i" + (i <= n ? ' class="on"' : "") + "></i>";
  var word = n <= 2 ? "fácil" : n === 3 ? "media" : n === 4 ? "difícil" : "experta";
  return '<span class="dots" role="img" aria-label="Dificultad ' + word + ', ' + n + ' de 5">' + s + "</span>";
}
function catTile(cat, size) {
  return '<span class="cat-tile' + (size ? " cat-tile-" + size : "") + '" style="--cat:' + cat.color + '">' + icon(cat.icon) + "</span>";
}
function catTag(ch) {
  var c = catBySlug[ch.cat];
  return '<span class="tag" style="--cat:' + c.color + '">' + icon(c.icon) + esc(c.name) + (topicLabel(ch) ? " · " + esc(topicLabel(ch)) : "") + "</span>";
}
function metaLine(ch) {
  return '<div class="meta">' + catTag(ch) + dots(ch.difficulty) +
    '<span class="meta-item">' + icon("clock") + "≈ " + durLabel(ch.duration) + "</span>" +
    (catBySlug[ch.cat].hidden ? '<span class="meta-item">Sin puntos</span>' : '<span class="meta-item">' + icon("trophy") + "hasta " + fmt(ch.max_points) + " pts</span>") + "</div>";
}
function stageHtml(ch, startLabel, note) {
  return '<section class="stage" data-stage aria-label="Zona de juego">' +
    '<div class="stage-intro" data-intro>' + metaLine(ch) +
    '<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-start>' + icon("play") + esc(startLabel || "Empezar") + "</button></div>" +
    '<p class="hint">' + esc(note || "El cronómetro empieza al pulsar. La rapidez solo da hasta un 20 % extra: piensa con calma.") + "</p>" +
    '<noscript><p class="hint"><b>Para jugar necesitas activar JavaScript.</b> Puedes leer las preguntas y la solución más abajo.</p></noscript></div>' +
    '<div class="hud" data-bar hidden><div class="hud-top">' + catTag(ch) +
    (KIND_LABELS[ch.kind] && KIND_LABELS[ch.kind] !== catBySlug[ch.cat].name ? '<span class="hud-kind">' + esc(KIND_LABELS[ch.kind]) + "</span>" : "") +
    '<span class="timer" data-timer-pill>' + icon("clock") + '<b data-timer>0</b><span class="sr-only"> segundos</span></span></div>' +
    '<div class="hud-progress"><span data-progress-text></span><span class="live-ok" data-live aria-live="polite"></span></div>' +
    '<div class="track"><span data-progress-bar></span></div></div>' +
    '<div class="stage-body" data-body hidden></div><div data-result hidden></div></section>';
}
function challengeRow(ch) {
  var c = catBySlug[ch.cat];
  return '<li><a class="row" href="' + challengeUrl(ch) + '" style="--cat:' + c.color + '">' + catTile(c) +
    '<span class="row-main"><span class="row-title">' + esc(ch.title) + '</span><span class="row-sub">' + esc(ch.excerpt) + "</span></span>" +
    '<span class="row-side">' + dots(ch.difficulty) + '<span class="row-dur">' + durLabel(ch.duration) + '</span><span class="row-best" data-best="' + esc(ch.slug) + '"></span></span></a></li>';
}
function challengeList(items) { return '<ul class="list">' + items.map(challengeRow).join("") + "</ul>"; }
/* Tarjeta de categoría. mode "play" lleva a jugar una sesión; si no, a
 * la página pública de la categoría. */
function catCard(cat, mode) {
  var n = PUBLIC_CHALLENGES.filter(function (c) { return c.cat === cat.slug; }).length;
  var link = mode === "play" ? href("/juegos/?tema=" + cat.slug) : catUrl(cat.slug);
  return '<li><a class="cat-card" href="' + link + '" style="--cat:' + cat.color + '">' + catTile(cat, "lg") +
    '<span class="cat-name">' + esc(cat.name) + '</span><span class="cat-desc">' + esc(cat.short) + "</span>" +
    '<span class="cat-foot">' + (cat.hidden ? "Sin puntos" : n + " retos + generados") + icon("arrow") + "</span></a></li>";
}
function catGrid(mode) { return '<ul class="cat-grid">' + PUBLIC_CATS.map(function (c) { return catCard(c, mode); }).join("") + "</ul>"; }

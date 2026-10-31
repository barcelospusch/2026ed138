const eventsElement = document.querySelector("#events");
const countElement = document.querySelector("#result-count");
const form = document.querySelector("#filters");
const statusElement = document.querySelector("#filter-status");
const loadErrorElement = document.querySelector("#load-error");
const geoEnabled = document.querySelector("#geo-enabled");
const geoFields = document.querySelector("#geo-fields");
const nightOnlyButton = document.querySelector("#night-only");

const urlFilterFields = [
    ["magnitudeMin", "#mag-min"],
    ["magnitudeMax", "#mag-max"],
    ["durationMin", "#duration-min"],
    ["durationMax", "#duration-max"],
    ["dateFrom", "#event-date"],
    ["latitude", "#latitude"],
    ["longitude", "#longitude"],
    ["radius", "#radius"]
];

let events = [];
let visibilityFromCoeff;
let occjsPromise;

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const coordinateFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
});

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatNumber(value, suffix = "") {
    const number = toFiniteNumber(value);
    return number === null ? "—" : `${numberFormat.format(number)}${suffix}`;
}

function formatCoordinates(ra, dec) {
    const rightAscension = toFiniteNumber(ra);
    const declination = toFiniteNumber(dec);
    if (rightAscension === null || declination === null) return "—";
    return `${coordinateFormat.format(rightAscension)}°, ${coordinateFormat.format(declination)}°`;
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : `${dateFormat.format(date)} UTC`;
}

function formatDuration(value) {
    const seconds = toFiniteNumber(value);
    if (seconds === null) return "—";
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    return minutes ? `${minutes} min ${numberFormat.format(remainder)} s` : `${numberFormat.format(seconds)} s`;
}

function metric(label, value) {
    return `<div class="metric"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
}

function renderEvent(event) {
    const isNight = event.occ_path_is_nightside === true;
    const condition = isNight ? "Noturna" : event.occ_path_is_nightside === false ? "Diurna" : "Não informada";
    const badgeClass = isNight ? "night" : event.occ_path_is_nightside === false ? "day" : "";
    const time = formatDate(event.date_time);
    const moonPhase = toFiniteNumber(event.moon_illuminated_fraction);
    const moonPhaseText = moonPhase !== null ? `${numberFormat.format(moonPhase * 100)}%` : "—";
    const starPosition = formatCoordinates(event.ra_star_deg, event.dec_star_deg);
    const asteroidPosition = formatCoordinates(event.ra_target_deg, event.dec_target_deg);

    return `
        <article class="event-card">
            <header class="card-head">
                <div>
                    <h3 class="event-name">${escapeHtml(event.principal_designation || event.name || "Evento sem designação")}</h3>
                    <div class="event-time"><i class="ph ph-clock" aria-hidden="true"></i>Ocultação: ${escapeHtml(time)}</div>
                </div>
                <div class="badges">
                    <span class="badge ${badgeClass}"><i class="ph ${isNight ? "ph-moon" : event.occ_path_is_nightside === false ? "ph-sun" : "ph-question"}" aria-hidden="true"></i> ${escapeHtml(condition)}</span>
                </div>
            </header>
            <div class="card-body">
                <dl class="metrics">
                    ${metric("Magnitude da estrela (g)", formatNumber(event.g_star))}
                    ${metric("Magnitude aparente do asteroide", formatNumber(event.apparent_magnitude))}
                    ${metric("Duração (long)", escapeHtml(formatDuration(event.long)))}
                    ${metric("Aproximação máxima (UTC)", escapeHtml(time))}
                    ${metric("Separação na aproximação", `${escapeHtml(formatNumber(event.closest_approach))}″`)}
                    ${metric("Fase iluminada da Lua", escapeHtml(moonPhaseText))}
                    ${metric("Elongação solar", `${escapeHtml(formatNumber(event.sun_elongation))}°`)}
                    ${metric("Separação da Lua", `${escapeHtml(formatNumber(event.moon_separation))}°`)}
                    ${metric("Posição da estrela (RA, Dec)", `<span class="coordinates">${escapeHtml(starPosition)}</span>`)}
                    ${metric("Posição do asteroide (RA, Dec)", `<span class="coordinates">${escapeHtml(asteroidPosition)}</span>`)}
                    ${metric("Início do caminho (UTC)", escapeHtml(formatDate(event.occ_path_coeff?.t0)))}
                    ${metric("Fim do caminho (UTC)", escapeHtml(formatDate(event.occ_path_coeff?.t1)))}
                </dl>
                <div class="event-id">ID: ${escapeHtml(event.id || "—")}</div>
            </div>
        </article>`;
}

function getNumericInput(id) {
    const value = document.querySelector(`#${id}`).value.trim();
    return value === "" ? null : Number(value);
}

function restoreFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    for (const [parameter, selector] of urlFilterFields) {
        const value = params.get(parameter);
        if (value !== null) document.querySelector(selector).value = value;
    }

    nightOnlyButton.setAttribute("aria-pressed", String(params.get("nightOnly") === "1"));
    geoEnabled.checked = params.get("geolocation") === "1";
    geoFields.hidden = !geoEnabled.checked;
}

function saveFiltersToUrl(filters) {
    const url = new URL(window.location.href);
    for (const [parameter] of urlFilterFields) url.searchParams.delete(parameter);
    url.searchParams.delete("nightOnly");
    url.searchParams.delete("geolocation");

    for (const [parameter] of urlFilterFields) {
        const value = filters[parameter];
        if (value !== null && value !== undefined && value !== "") {
            url.searchParams.set(parameter, String(value));
        }
    }
    if (filters.nightOnly) url.searchParams.set("nightOnly", "1");
    if (filters.geolocation) url.searchParams.set("geolocation", "1");

    window.history.replaceState(null, "", url);
}

function getFilters() {
    const filters = {
        magnitudeMin: getNumericInput("mag-min"),
        magnitudeMax: getNumericInput("mag-max"),
        durationMin: getNumericInput("duration-min"),
        durationMax: getNumericInput("duration-max"),
        dateFrom: document.querySelector("#event-date").value,
        nightOnly: nightOnlyButton.getAttribute("aria-pressed") === "true",
        geolocation: geoEnabled.checked
    };

    if (filters.magnitudeMin !== null && filters.magnitudeMax !== null && filters.magnitudeMin > filters.magnitudeMax) {
        throw new Error("A magnitude mínima não pode ser maior que a máxima.");
    }
    if (filters.durationMin !== null && filters.durationMax !== null && filters.durationMin > filters.durationMax) {
        throw new Error("A duração mínima não pode ser maior que a máxima.");
    }
    if (filters.geolocation) {
        filters.latitude = getNumericInput("latitude");
        filters.longitude = getNumericInput("longitude");
        filters.radius = getNumericInput("radius");
        if (filters.latitude === null || filters.longitude === null || filters.radius === null) {
            throw new Error("Informe latitude, longitude e raio para filtrar por geolocalização.");
        }
        if (filters.latitude < -90 || filters.latitude > 90) {
            throw new Error("A latitude deve estar entre -90° e 90°.");
        }
        if (filters.longitude < -180 || filters.longitude > 180) {
            throw new Error("A longitude deve estar entre -180° e 180°.");
        }
        if (filters.radius < 0) throw new Error("O raio de busca não pode ser negativo.");
    }
    return filters;
}

async function loadOccjs() {
    if (!occjsPromise) {
        occjsPromise = import("https://cdn.jsdelivr.net/npm/@dimitri.pusch/occjs@0.3.2/src/geofilter.js")
            .then((module) => {
                if (typeof module.visibilityFromCoeff !== "function") {
                    throw new Error("A biblioteca occjs não disponibilizou visibilityFromCoeff.");
                }
                visibilityFromCoeff = module.visibilityFromCoeff;
            });
    }
    return occjsPromise;
}

function matchesNonGeographicFilters(event, filters) {
    const magnitude = toFiniteNumber(event.g_star);
    const duration = toFiniteNumber(event.long);
    const date = new Date(event.date_time).getTime();

    if (filters.magnitudeMin !== null && (magnitude === null || magnitude < filters.magnitudeMin)) return false;
    if (filters.magnitudeMax !== null && (magnitude === null || magnitude > filters.magnitudeMax)) return false;
    if (filters.durationMin !== null && (duration === null || duration < filters.durationMin)) return false;
    if (filters.durationMax !== null && (duration === null || duration > filters.durationMax)) return false;
    if (filters.dateFrom && !Number.isFinite(date)) return false;
    if (filters.dateFrom && date < new Date(filters.dateFrom).getTime()) return false;
    if (filters.nightOnly && event.occ_path_is_nightside !== true) return false;
    return true;
}

async function applyFilters() {
    statusElement.textContent = "";
    let filters;
    try {
        filters = getFilters();
        if (filters.geolocation) await loadOccjs();
    } catch (error) {
        statusElement.textContent = error instanceof Error ? error.message : "Não foi possível aplicar os filtros.";
        return;
    }

    let filtered = events.filter((event) => matchesNonGeographicFilters(event, filters));
    if (filters.geolocation) {
        try {
            filtered = filtered.filter((event) => event.occ_path_coeff && visibilityFromCoeff({
                latitude: filters.latitude,
                longitude: filters.longitude,
                radius: filters.radius,
                occPathCoeff: event.occ_path_coeff,
                checkNighttime: false
            }));
        } catch (error) {
            statusElement.textContent = error instanceof Error
                ? `Falha ao avaliar o caminho geográfico: ${error.message}`
                : "Falha ao avaliar o caminho geográfico.";
            return;
        }
    }

    saveFiltersToUrl(filters);
    filtered.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
    countElement.textContent = `${filtered.length} de ${events.length} eventos`;
    eventsElement.innerHTML = filtered.length
        ? filtered.map(renderEvent).join("")
        : '<div class="empty">Nenhum evento corresponde aos filtros selecionados.</div>';
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    void applyFilters();
});

nightOnlyButton.addEventListener("click", () => {
    const isPressed = nightOnlyButton.getAttribute("aria-pressed") === "true";
    nightOnlyButton.setAttribute("aria-pressed", String(!isPressed));
    void applyFilters();
});

geoEnabled.addEventListener("change", () => {
    geoFields.hidden = !geoEnabled.checked;
    if (geoEnabled.checked) {
        void loadOccjs().catch((error) => {
            statusElement.textContent = `Não foi possível carregar occjs: ${error.message}`;
        });
    }
});

form.addEventListener("reset", () => {
    window.setTimeout(() => {
        geoFields.hidden = true;
        nightOnlyButton.setAttribute("aria-pressed", "false");
        statusElement.textContent = "";
        void applyFilters();
    });
});

async function initialize() {
    try {
        restoreFiltersFromUrl();
        const response = await fetch("./data.json");
        if (!response.ok) throw new Error(`data.json respondeu com HTTP ${response.status}.`);
        const data = await response.json();
        if (!data || !Array.isArray(data.results)) {
            throw new Error("O arquivo data.json não contém um array results válido.");
        }
        events = data.results;
        await applyFilters();
    } catch (error) {
        countElement.textContent = "Não foi possível carregar os eventos";
        loadErrorElement.textContent = `Erro ao carregar os dados: ${error instanceof Error ? error.message : "erro desconhecido"}. Sirva os arquivos por um servidor HTTP local para que o navegador possa acessar data.json.`;
        loadErrorElement.hidden = false;
    }
}

void initialize();
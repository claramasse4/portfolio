const API = "http://127.0.0.1:8000/api";
const SLUG = "clara-masse";

// Valeurs de `type` considérées comme bénévolat / engagement associatif (ajoute les tiennes)
const TYPES_ASSOCIATIFS = ["associatif", "benevolat", "engagement", "vie associative"];

const $ = (id) => document.getElementById(id);

// Minuscules + sans accents : « Bénévolat » == « benevolat »
const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Un rendu qui plante ne bloque pas les autres sections
const safe = (fn) => { try { fn(); } catch (e) { console.error(e); } };

// Observer pour les éléments ajoutés dynamiquement
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
        if (e.isIntersecting) {
            e.target.classList.add("in");
            revealObserver.unobserve(e.target);
        }
    });
}, { threshold: 0.15 });

function observeReveal(root) {
    root.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
}

// ── Helpers ──────────────────────────────────────────────────────
async function getJson(path) {
    const r = await fetch(`${API}${path}`);
    if (!r.ok) throw new Error(`${path} : ${r.status}`);
    return r.json();
}

// Crée un élément sans innerHTML (évite l'injection de HTML)
function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        if (k === "text") node.textContent = v;
        else if (k === "class") node.className = v;
        else node.setAttribute(k, v);
    }
    node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
    return node;
}

const stripProto = (url) => url.replace(/^https?:\/\//, "");
const periode = (debut, fin) => `${debut} — ${fin || "aujourd'hui"}`;

// Dictionnaire slug -> nom, rempli au chargement
let competenceNoms = {};
const nomOf = (slug) => competenceNoms[slug] ?? slug;

// ── Contacts ─────────────────────────────────────────────────────
function setLink(el, value, { prefix = "", label = value } = {}) {
    if (!el) return;
    if (value) {
        el.textContent = label;
        el.href = prefix + value;
    } else {
        el.textContent = "Non renseigné";
        el.removeAttribute("href");
    }
}

function renderContacts(contacts) {
    setLink($("contactEmail"), contacts.email, { prefix: "mailto:" });

    setLink($("contactLinkedIn"), contacts.linkedin, {
        label: contacts.linkedin ? stripProto(contacts.linkedin) : "",
    });

    const githubItem = $("contactGitHubItem");
    if (contacts.github) {
        setLink($("contactGitHub"), contacts.github, { label: stripProto(contacts.github) });
        githubItem.hidden = false;
    } else {
        githubItem.hidden = true;
    }
}

// ── Bio ──────────────────────────────────────────────────
function renderProfil(p) {
    const bio = $("bio");
    if (bio) bio.textContent = p.bio ?? "";
}

// ── Expériences & engagement ─────────────────────────────────────
function renderTimeline(container, items) {
    container.replaceChildren(
        ...items.map((x) =>
            h("article", { class: "item reveal" },
                h("span", { class: "when", text: periode(x.debut, x.fin) }),
                h("h3", { text: x.poste }),
                h("p", { class: "org", text: x.structure }),
                x.missions?.length
                    ? h("ul", {}, ...x.missions.map((m) => h("li", { text: m })))
                    : null
            )
        )
    );
    observeReveal(container);
}

const isAssociatif = (x) => TYPES_ASSOCIATIFS.map(norm).includes(norm(x.type));

function renderExperiences(experiences) {
    const triees = [...experiences].sort((a, b) => (b.debut ?? "").localeCompare(a.debut ?? ""));
    renderTimeline($("experiencesList"), triees.filter((x) => !isAssociatif(x)));
    renderTimeline($("assocList"), triees.filter(isAssociatif));
}

// ── Compétences ──────────────────────────────────────────────────
function renderSkills(competences) {
    const groupes = {};
    for (const c of competences) {
        (groupes[c.categorie] ??= []).push(c.nom);
    }

    $("skillsList").replaceChildren(
        ...Object.entries(groupes).map(([categorie, noms]) =>
            h("div", { class: "skill-category" },
                h("div", { class: "group-head" },
                    h("h4", {}, h("span", { class: "star", text: "✳" }), categorie)
                ),
                h("div", { class: "chips" },
                    ...noms.map((nom) => h("span", { class: "chip", text: nom }))
                )
            )
        )
    );
}

// ── Centres d'intérêt ────────────────────────────────────────────
// Sans données API, les cartes en dur de index.html restent affichées
function renderInterets(interets) {
    if (!interets.length) return;
    $("interetsList").replaceChildren(
        ...interets.map((i) =>
            h("article", { class: "interest-card" }, h("span", { text: i }))
        )
    );
    observeReveal($("interetsList"));
}

// ── Projets (liste + détail dans la boîte de dialogue) ───────────
const dialog = $("projetDialog");

function projetCard(p) {
    return h("article", {
            class: "project-card reveal clickable",
            tabindex: "0",
            role: "button",
            "data-slug": p.slug,
        },
        h("div", {},
            h("div", { class: "project-visual" }),
            h("div", { style: "margin-top: 1.3rem;" },
                h("span", { class: "project-meta", text: p.date_realisation }),
                h("h3", { text: p.titre }),
                h("p", { text: p.description ?? "" }),
                h("span", { class: "project-more", text: "Voir le détail →" })
            )
        ),
        h("div", { class: "tags" },
            ...p.skills_slugs.map((s) => h("span", { class: "tag", text: nomOf(s) }))
        )
    );
}

function renderProjets(projets) {
    $("projectsRail").replaceChildren(...projets.map(projetCard));
    observeReveal($("projectsRail"));
}

async function openProjet(slug) {
    const content = $("projetContent");
    content.replaceChildren(h("p", { text: "Chargement..." }));
    dialog.showModal();

    try {
        const p = await getJson(`/projets/${encodeURIComponent(slug)}`);

        content.replaceChildren(
            h("p", { class: "eyebrow", text: p.date_realisation }),
            h("h3", { text: p.titre }),
            p.description ? h("p", { text: p.description }) : null,

            p.competences_detaillees?.length
                ? h("h4", { text: "Compétences mobilisées" })
                : null,
            h("div", { class: "tags" },
                ...(p.competences_detaillees ?? []).map((c) =>
                    h("span", { class: "tag", text: c.nom ?? nomOf(c.slug) })
                )
            ),

            p.projets_similaires?.length
                ? h("h4", { text: "Projets similaires" })
                : null,
            ...(p.projets_similaires ?? []).map((s) =>
                h("button", { class: "link-btn", type: "button", "data-slug": s.slug, text: s.titre })
            )
        );
    } catch (error) {
        console.error("Détail projet :", error);
        content.replaceChildren(h("p", { text: "Impossible de charger ce projet." }));
    }
}

// Clic ou Entrée sur une carte
$("projectsRail").addEventListener("click", (e) => {
    const card = e.target.closest("[data-slug]");
    if (card) openProjet(card.dataset.slug);
});
$("projectsRail").addEventListener("keydown", (e) => {
    const card = e.target.closest("[data-slug]");
    if (card && e.key === "Enter") openProjet(card.dataset.slug);
});

// Fermeture (✕, clic sur le fond) ; clic sur un projet similaire
dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("#closeProjet")) return dialog.close();
    const lien = e.target.closest("[data-slug]");
    if (lien) openProjet(lien.dataset.slug);
});

// ── Formations ───────────────────────────────────────────────────
function renderFormations(formations) {
    $("formationList").replaceChildren(
        ...formations.map((f) =>
            h("div", { class: "edu-box reveal" },
                h("div", {},
                    h("p", { class: "eyebrow", text: "Formation" }),
                    h("span", { class: "when", text: periode(f.debut, f.fin) }),
                    h("h3", { text: f.diplome }),
                    h("p", { class: "org", text: f.ecole })
                ),
                h("div", {},
                    h("p", { class: "eyebrow", text: "Compétences mobilisées" }),
                    h("ul", { class: "edu-list" },
                        ...f.competences.map((s) => h("li", { text: nomOf(s) }))
                    )
                )
            )
        )
    );
    observeReveal($("formationList"));
}

// ── Chargement ───────────────────────────────────────────────────
async function init() {
    const [detailR, competencesR, projetsR] = await Promise.allSettled([
        getJson(`/personnes/${encodeURIComponent(SLUG)}`),
        getJson("/competences"),
        getJson("/projets"),
    ]);

    if (competencesR.status === "fulfilled") {
        safe(() => {
            competenceNoms = Object.fromEntries(competencesR.value.map((c) => [c.slug, c.nom]));
        });
    } else {
        console.error("Compétences :", competencesR.reason);
    }

    if (detailR.status === "fulfilled") {
        const detail = detailR.value;
        const p = detail.profil;
        console.log("Profil reçu :", detail);

        safe(() => renderContacts(p.contacts ?? {}));
        safe(() => renderProfil(p));
        safe(() => renderExperiences(p.experiences ?? []));
        safe(() => renderSkills(detail.competences_graphe ?? []));
        safe(() => renderFormations(p.formations ?? []));
        safe(() => renderInterets(p.interets ?? []));
    } else {
        console.error("Profil :", detailR.reason);
        renderContacts({});
    }

    if (projetsR.status === "fulfilled") {
        safe(() => renderProjets(projetsR.value.filter((x) => x.personne_slugs.includes(SLUG))));
    } else {
        console.error("Projets :", projetsR.reason);
    }

    console.log("Chargement terminé.");
}

document.querySelector("footer a[href='#top']")?.addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});




init();
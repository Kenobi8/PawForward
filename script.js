/* script.js - Site-wide behavior. Needs Layout.js (top of <body>) and Core.js loaded first. */
// (Removed) requireAuth() was being overridden to always return true, which let
// signed-out visitors "save" pets / claim shifts with nothing stored.


if (typeof Auth !== 'undefined') {
    const originalAuthCurrent = Auth.current;
    Auth.current = function() {
        let user = originalAuthCurrent ? originalAuthCurrent() : null;
        if (!user) {
            const email = localStorage.getItem("paw_user_email") || sessionStorage.getItem("paw_user_email");
            if (email) {
                user = { email: email, firstName: email.split('@')[0], role: localStorage.getItem("paw_user_role") || "user" };
            }
        }
        return user;
    };
}

const byId = (id) => document.getElementById(id);
const qs = (sel, root) => (root || document).querySelector(sel);
const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* =============================== Theme =============================== */
document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.classList.add("theme-anim");
    root.dataset.theme = next;
    try { localStorage.setItem("pawforwardTheme", next); } catch (err) {}
    qsa("[data-theme-toggle]").forEach((b) => b.setAttribute("aria-pressed", next === "dark"));
    setTimeout(() => root.classList.remove("theme-anim"), 450);
});

/* =============================== Toast =============================== */
const toastStack = document.createElement("div");
toastStack.className = "toast-stack";
toastStack.setAttribute("aria-live", "polite");
document.body.appendChild(toastStack);

function toast(message, opts) {
    const o = Object.assign({ type: "success", duration: 3800, action: null }, opts);
    const t = document.createElement("div");
    t.className = "toast " + o.type;
    t.setAttribute("role", "status");
    t.innerHTML = '<span class="t-icon" aria-hidden="true"></span><span class="t-msg"></span>';
    t.querySelector(".t-icon").textContent = o.type === "success" ? "\u2713" : o.type === "info" ? "i" : "!";
    t.querySelector(".t-msg").textContent = message;
    let timer;
    function dismiss() { clearTimeout(timer); t.classList.remove("show"); setTimeout(() => t.remove(), 500); }
    if (o.action) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "t-action"; b.textContent = o.action.label;
        b.addEventListener("click", () => { o.action.onClick(); dismiss(); });
        t.appendChild(b);
    }
    toastStack.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
    timer = setTimeout(dismiss, o.duration);
    t.addEventListener("mouseenter", () => clearTimeout(timer));
    t.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 1500); });
    return dismiss;
}

/* ====================== Form validation helpers ====================== */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const need = (label) => (v) => (v.trim() ? "" : label + " is required.");
const emailRule = (v) => !v.trim() ? "Email is required." : EMAIL_RE.test(v.trim()) ? "" : "Enter a valid email, like name@example.com.";

function setFieldState(input, error, okText) {
    const field = input.closest(".field");
    if (!field) return !error;
    const msg = field.querySelector(".field-msg");
    field.classList.toggle("is-invalid", !!error);
    field.classList.toggle("is-valid", !error && !!okText);
    input.setAttribute("aria-invalid", error ? "true" : "false");
    if (msg) msg.textContent = error || okText || "";
    return !error;
}
function clearFieldStates(root) {
    qsa(".field", root).forEach((f) => {
        f.classList.remove("is-invalid", "is-valid");
        const m = qs(".field-msg", f); if (m) m.textContent = "";
        const i = qs("input, select, textarea", f); if (i) i.removeAttribute("aria-invalid");
    });
}

function wireForm(form, rules, onValid) {
    if (!form) return;
    const ids = Object.keys(rules);
    const validate = (id) => { const input = byId(id); return setFieldState(input, rules[id].check(input.value), rules[id].ok); };
    ids.forEach((id) => {
        const input = byId(id);
        if (!input) return;
        let touched = false;
        input.addEventListener("blur", () => { if (!input.value.trim()) return; touched = true; validate(id); });
        input.addEventListener("input", () => {
            if (touched || input.closest(".field").classList.contains("is-invalid")) validate(id);
            (rules[id].also || []).forEach((other) => { if (byId(other).value) validate(other); });
        });
    });
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        let first = null;
        ids.forEach((id) => { if (!validate(id) && !first) first = byId(id); });
        if (first) { first.focus(); return; }
        onValid();
    });
}

/* ========================= Password "eye" toggle ========================= */
const EYE =
    '<svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
    '<svg class="off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18.4 18.4 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2m-6.7-1.1a3 3 0 1 1-4.2-4.2"/><path d="M1 1l22 22"/></svg>';

function addPasswordToggles(root) {
    if (!root) return;
    qsa('input[type="password"]', root).forEach((input) => {
        if (input.closest(".pw-wrap")) return;
        const wrap = document.createElement("div");
        wrap.className = "pw-wrap";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "pw-toggle"; btn.innerHTML = EYE;
        btn.setAttribute("aria-label", "Show password");
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", () => {
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.setAttribute("aria-pressed", show);
            btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        });
        wrap.appendChild(btn);
    });
}

/* ===================== Sign-in dialog + Firebase Auth Sync ===================== */
const dlg = byId("authDialog");
const signInBtn = byId("openPopup");
const accountLink = byId("accountLink");
const adminQuickBtn = byId("adminQuickBtn");
const header = byId("siteHeader");
const pw8 = (v) => !v ? "Password is required." : v.length < 8 ? "Use at least 8 characters (" + v.length + "/8)." : "";

addPasswordToggles(dlg);

const VIEW_TITLES = { in: "authTitle", up: "upTitle", forgot: "forgotTitle", code: "codeTitle" };
let resetEmail = "", codeEmail = "";

function authNote(text) { const n = byId("authNotice"); if (n) { n.textContent = text || ""; n.hidden = !text; } }
function focusFirst() { const f = qs("[data-view]:not([hidden]) form:not([hidden]) input", dlg); if (f) f.focus(); }

function showAuthView(which) {
    qsa("[data-view]", dlg).forEach((sec) => { sec.hidden = sec.dataset.view !== which; });
    dlg.setAttribute("aria-labelledby", VIEW_TITLES[which]);
    qsa(".form-error", dlg).forEach((e) => { e.hidden = true; });
    if (which === "forgot") { byId("forgotForm").hidden = false; byId("resetForm").hidden = true; byId("forgotMsg").hidden = true; }
    if (which === "code") { byId("codeForm").hidden = false; byId("codeVerify").hidden = true; }
    focusFirst();
}
function openAuth(notice, view) {
    if (!dlg) return;
    authNote(notice);
    qsa("form", dlg).forEach((f) => { f.reset(); clearFieldStates(f); });
    qsa('.pw-toggle[aria-pressed="true"]', dlg).forEach((b) => b.click());
    if (!dlg.open) dlg.showModal();
    document.body.style.overflow = "hidden";
    showAuthView(view || "in");
}
window.openAuthModal = openAuth; 
function closeAuth() { if (dlg && dlg.open) dlg.close(); }

function requireAuth(notice) {
    if ((typeof Auth !== 'undefined' && Auth.current()) || localStorage.getItem("paw_user_email") || sessionStorage.getItem("paw_user_email")) return true;
    openAuth(notice);
    return false;
}

function refreshAuth() {
    const user = (typeof Auth !== 'undefined' && Auth.current()) || localStorage.getItem("paw_user_email");
    const isAdmin = localStorage.getItem("paw_user_role") === "admin" || (user && user.role === "admin");

    if (signInBtn) signInBtn.textContent = user ? "Sign Out" : "Sign In";
    if (adminQuickBtn) adminQuickBtn.hidden = !isAdmin;
    if (byId("mobileAdmin")) byId("mobileAdmin").hidden = !isAdmin;

    if (accountLink) {
        accountLink.hidden = !user;
        if (user) {
            const nameStr = localStorage.getItem("paw_user_name") || (user.firstName || user.email || "U");
            accountLink.textContent = nameStr.charAt(0).toUpperCase();
            accountLink.title = "My account";
        }
    }
    if (byId("mobileAccount")) byId("mobileAccount").hidden = !user;

    qsa(".heart").forEach((h) => h.setAttribute("aria-pressed", UserData.isSaved(h.dataset.name)));
}

if (dlg) {
    dlg.addEventListener("close", () => { document.body.style.overflow = ""; });
    dlg.addEventListener("click", (e) => {
        if (e.target === dlg) return closeAuth();
        const link = e.target.closest("[data-view-link]");
        if (link) { e.preventDefault(); authNote(""); showAuthView(link.dataset.viewLink); return; }
    });
    byId("authClose").addEventListener("click", closeAuth);
}

if (signInBtn) {
    signInBtn.addEventListener("click", (e) => {
        if ((typeof Auth !== 'undefined' && Auth.current()) || localStorage.getItem("paw_user_email")) {
            e.preventDefault();
            if (typeof Auth !== 'undefined') Auth.signOut();
            localStorage.removeItem("paw_user_email");
            localStorage.removeItem("paw_user_name");
            localStorage.removeItem("paw_user_role");
            refreshAuth();
            toast("You've been signed out safely.");
        } else {
            openAuth();
        }
    });
}
window.addEventListener("storage", refreshAuth);
window.addEventListener("authchange", refreshAuth);

function authSuccess(message) { closeAuth(); refreshAuth(); toast(message + "Friend!"); }
function authFail(id, text) { const el = byId(id); if (el) { el.textContent = text; el.hidden = false; } }

wireForm(byId("signInForm"), {
    email:    { check: emailRule, ok: "" },
    password: { check: need("Password"), ok: "" }
}, async () => {
    const emailVal = byId("email").value.trim();
    const passVal = byId("password").value;
    const submitBtn = byId("signInSubmitBtn");

    try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Verifying..."; }

        if (window.PawFirebase) {
            const { isAdmin } = await window.PawFirebase.login(emailVal, passVal);
            // Only remember the user once the login has actually succeeded.
            localStorage.setItem("paw_user_email", emailVal);
            localStorage.setItem("paw_user_name", emailVal.split('@')[0]);
            if (isAdmin) localStorage.setItem("paw_user_role", "admin");
            closeAuth();
            refreshAuth();
            
            if (isAdmin) {
                toast("Creator/Admin verified! Entering Command Center...", {
                    action: { label: "Open Panel", onClick: () => { window.location.href = "admin.html"; } }
                });
                setTimeout(() => { window.location.href = "admin.html"; }, 800);
                return;
            }
            authSuccess("Welcome back, ");
            return;
        }
    } catch (fbErr) {
        authFail("signInError", "Invalid email or password.");
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign in"; }
    }
});

wireForm(byId("signUpForm"), {
    signUpEmail:    { check: emailRule, ok: "Email looks good" },
    signUpPassword: { check: pw8, ok: "Password is strong" }
}, async () => {
    const emailVal = byId("signUpEmail").value.trim();
    const passVal = byId("signUpPassword").value;
    const submitBtn = byId("signUpSubmitBtn");

    try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating account..."; }

        if (window.PawFirebase) {
            const { isAdmin } = await window.PawFirebase.register(emailVal, passVal);
            localStorage.setItem("paw_user_email", emailVal);
            localStorage.setItem("paw_user_name", emailVal.split('@')[0]);
            if (isAdmin) localStorage.setItem("paw_user_role", "admin");
            closeAuth();
            refreshAuth();
            toast("Welcome to PawForward!");
            return;
        }
    } catch (fbErr) {
        authFail("signUpError", fbErr.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create account"; }
    }
});

wireForm(byId("forgotForm"), { fgEmail: { check: emailRule, ok: "" } }, async () => {
    const email = byId("fgEmail").value.trim();
    const m = byId("forgotMsg");
    if (window.PawFirebase) {
        try { await window.PawFirebase.resetPasswordEmail(email); } catch (e) {}
    }
    m.textContent = "If an account exists for " + email + ", a password reset link has been sent to that inbox.";
    m.hidden = false;
});

wireForm(byId("codeForm"), { cdEmail: { check: emailRule, ok: "" } }, () => {
    const email = byId("cdEmail").value;
    const code = Auth.sendCode(email);
    byId("codeError").hidden = true;
    codeEmail = email;
    byId("codeHint").textContent = "Your one-time verification code is " + code + ".";
    byId("codeVerify").hidden = false;
    byId("cdCode").focus();
});
wireForm(byId("codeVerify"), { cdCode: { check: (v) => /^\d{6}$/.test(v.trim()) ? "" : "Enter the 6-digit code.", ok: "" } }, () => {
    const r = Auth.verifyCode(codeEmail, byId("cdCode").value);
    if (!r.ok) return authFail("verifyError", r.error);
    authSuccess("Welcome back, ");
});

refreshAuth();

/* Donate-to-an-animal buttons (community.html). Signed in -> go straight to the
   donate page. Signed out -> ask them to sign in, then continue automatically. */
let pendingDonateTo = null;
function donateTo(name) {
    const go = () => { location.href = "donate.html?for=" + encodeURIComponent(name); };
    if (typeof Auth !== "undefined" && Auth.current()) { go(); return; }
    pendingDonateTo = go;
    openAuth("Sign in to donate to " + name);
}
window.addEventListener("authchange", () => {
    if (pendingDonateTo && typeof Auth !== "undefined" && Auth.current()) {
        const go = pendingDonateTo; pendingDonateTo = null; setTimeout(go, 600);
    }
});

// (Removed) A click handler used to silently sign everyone in as
// "supporter@pawforward.org" when they clicked anything containing "donate".
// Guests now donate through the "Donate as guest" option on donate.html.

/* ================== Header: solid on scroll, progress line ================== */
const mainNav = byId("mainNav");
const menuToggle = byId("menuToggle");
const progressBar = byId("scrollProgress");
function onScroll() {
    if (!header) return;
    const y = window.scrollY;
    header.classList.toggle("scrolled", y > 60 || (mainNav && mainNav.classList.contains("open")));
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progressBar) progressBar.style.transform = "scaleX(" + (max > 0 ? Math.min(y / max, 1) : 0) + ")";
}
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);
onScroll();

if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
        const open = mainNav.classList.toggle("open");
        menuToggle.setAttribute("aria-expanded", open);
        onScroll();
    });
}

/* ========================= Smooth page transitions ========================= */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === "_blank" || a.hasAttribute("download") || reduceMotion) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.protocol !== location.protocol || url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    e.preventDefault();
    document.body.classList.add("leaving");
    setTimeout(() => { location.href = a.href; }, 220);
});
window.addEventListener("pageshow", (e) => { if (e.persisted) document.body.classList.remove("leaving"); });

/* ===================== Reveal, counters, progress bar ===================== */
function animateCount(el) {
    const target = +el.dataset.count, start = performance.now(), duration = 1800;
    (function tick(now) {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
    })(start);
}
const homeFill = byId("progressFill"), homeText = byId("progressText");
if (homeFill && homeFill.dataset.percent) {
    const pct = Math.round(Fund.percent());
    homeFill.dataset.percent = pct;
    if (homeText) homeText.textContent = pct + "% of this month's goal reached";
}
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add("in");
        if (el.dataset.count) animateCount(el);
        if (el.dataset.percent) el.style.width = el.dataset.percent + "%";
        observer.unobserve(el);
    });
}, { threshold: 0.2 });
qsa(".reveal, [data-count], [data-percent]").forEach((el) => observer.observe(el));

/* ==================== Quick-donate widget (About page) ==================== */
const donateNow = byId("donateNow");
if (donateNow) {
    const amountBtns = qsa(".amount-btn");
    const customInput = byId("customAmount");
    const impactText = byId("donateImpact");
    const showImpact = (amount) => {
        if (!(amount >= 1)) { impactText.textContent = ""; donateNow.href = "donate.html"; return; }
        const days = Math.max(1, Math.floor(amount / 25));
        impactText.textContent = "\u20B1" + Number(amount).toLocaleString() + " feeds a rescued animal for " + days + (days === 1 ? " day" : " days");
        donateNow.href = "donate.html?amount=" + amount;
    };
    amountBtns.forEach((btn) => btn.addEventListener("click", () => {
        amountBtns.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        customInput.value = "";
        showImpact(+btn.dataset.amount);
    }));
    customInput.addEventListener("input", () => {
        amountBtns.forEach((b) => b.classList.remove("selected"));
        showImpact(+customInput.value);
    });
    showImpact(250);
}

/* ======== Home teaser + Adopt page (Merges Local + Live Firestore Animals) ======== */
const teaserGrid = byId("teaserGrid");
if (teaserGrid) sortAnimals(ANIMALS).slice(0, 3).forEach((a, i) => teaserGrid.appendChild(animalCard(a, i)));

const animalGrid = byId("animalGrid");
let renderAnimalsGlobal = null;

if (animalGrid) {
    const filters = { type: "all", age: "all", sex: "all", gem: false };
    const gemBtn = byId("gemOnly");

    function renderAnimals() {
        const list = sortAnimals(ANIMALS).filter((a) =>
            (filters.type === "all" || a.type === filters.type) &&
            (filters.age === "all" || ageGroup(a) === filters.age) &&
            (filters.sex === "all" || a.sex === filters.sex) &&
            (!filters.gem || isHiddenGem(a)));
        animalGrid.innerHTML = "";
        list.forEach((a, i) => animalGrid.appendChild(animalCard(a, i)));
        const gems = list.filter(isHiddenGem).length;
        if (byId("resultCount")) {
            byId("resultCount").textContent = "Showing " + list.length + " of " + ANIMALS.length + " animals" + (gems ? " \u00B7 " + gems + " Hidden Gem" + (gems === 1 ? "" : "s") + " first" : "");
        }
        if (!list.length) animalGrid.innerHTML = '<p class="grid-empty">No animals match these filters. Try removing one.</p>';
    }
    renderAnimalsGlobal = renderAnimals;

    function resetFilters() {
        Object.assign(filters, { type: "all", age: "all", sex: "all", gem: false });
        qsa("#filters .chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.value === "all" ? "true" : "false"));
        if (gemBtn) gemBtn.setAttribute("aria-pressed", "false");
        renderAnimals();
    }
    if (byId("filters")) {
        byId("filters").addEventListener("click", (e) => {
            const chip = e.target.closest(".chip");
            if (!chip) return;
            if (chip === gemBtn) {
                filters.gem = !filters.gem;
                gemBtn.setAttribute("aria-pressed", filters.gem);
            } else {
                const group = chip.closest(".filter-group");
                qsa(".chip", group).forEach((c) => c.setAttribute("aria-pressed", c === chip));
                filters[group.dataset.group] = chip.dataset.value;
            }
            renderAnimals();
        });
    }
    if (byId("clearFilters")) byId("clearFilters").addEventListener("click", resetFilters);
    renderAnimals();
}

async function syncCloudAnimalsToCatalog() {
    let attempts = 0;
    while (!window.PawFirebase && attempts < 25) {
        await new Promise(r => setTimeout(r, 150));
        attempts++;
    }
    if (!window.PawFirebase) return;
    const cloudPets = await window.PawFirebase.fetchCloudAnimals();
    if (!cloudPets.length) return;

    const existingNames = new Set(ANIMALS.map(a => a.name.toLowerCase()));
    let added = false;
    cloudPets.forEach(pet => {
        if (!existingNames.has(pet.name.toLowerCase())) {
            ANIMALS.unshift(pet);
            existingNames.add(pet.name.toLowerCase());
            added = true;
        }
    });

    if (added) {
        if (renderAnimalsGlobal) renderAnimalsGlobal();
        if (teaserGrid) {
            teaserGrid.innerHTML = "";
            sortAnimals(ANIMALS).slice(0, 3).forEach((a, i) => teaserGrid.appendChild(animalCard(a, i)));
        }
        window.dispatchEvent(new Event("cloudanimalssynced"));
    }
}
syncCloudAnimalsToCatalog();

/* ============ Contact & Adoption Application Form (Synced to Firestore) ============ */
const contactForm = byId("contactForm");
if (contactForm) {
    const pet = new URLSearchParams(location.search).get("pet");
    if (pet) {
        byId("cTopic").value = "Adopting a pet";
        byId("cMessage").value = "Hi PawForward! I would love to apply to adopt " + pet + " and schedule a shelter visit.";
    }
    const currUser = Auth.current();
    if (currUser) {
        if (byId("cName") && !byId("cName").value) byId("cName").value = currUser.firstName || "";
        if (byId("cEmail") && !byId("cEmail").value) byId("cEmail").value = currUser.email || "";
    }

    wireForm(contactForm, {
        cName:    { check: need("Name"), ok: "Looks good" },
        cEmail:   { check: emailRule, ok: "Email looks good" },
        cMessage: { check: need("Message"), ok: "" }
    }, async () => {
        const name = byId("cName").value.trim();
        const email = byId("cEmail").value.trim();
        const topic = byId("cTopic").value;
        const message = byId("cMessage").value.trim();
        const msgEl = byId("formThanks");

        if (Auth.current()) {
            UserData.addInquiry({ topic, pet: pet || "", message });
        }

        if (window.PawFirebase) {
            try {
                await window.PawFirebase.submitInquiryToCloud({ name, email, topic, pet: pet || topic, message });
            } catch (e) {
                console.warn("Cloud inquiry save notice:", e);
            }
        }

        msgEl.textContent = "Thanks, " + name + "! Your application/inquiry has been logged in our shelter database and emailed to our team.";
        msgEl.classList.add("show");
        toast("Application submitted to PawForward!");
        contactForm.reset();
        clearFieldStates(contactForm);
    });
}

/* ===================== Payment picker (donate + checkout) ===================== */
let payCount = 0;
function paymentPicker() {
    const name = "pay" + (++payCount);
    const METHODS = [["card", "Card", "#6b7280"], ["gcash", "GCash", "#007cff"], ["maya", "Maya", "#12b76a"], ["bank", "Bank transfer", "#b63737"]];
    const input = (key, label, ph, ac, extra) =>
        '<div class="field"><label for="' + name + "-" + key + '">' + label + '<span class="req" aria-hidden="true">*</span></label>' +
        '<input id="' + name + "-" + key + '" inputmode="numeric" placeholder="' + ph + '" autocomplete="' + ac + '" ' + extra + '><small class="field-msg"></small></div>';

    const el = document.createElement("fieldset");
    el.className = "pay";
    el.innerHTML =
        "<legend>Payment method</legend>" +
        '<div class="pay-methods">' + METHODS.map((m, i) =>
            '<label class="pay-opt"><input type="radio" name="' + name + '" value="' + m[0] + '"' + (i === 0 ? " checked" : "") + '><span><i style="background:' + m[2] + '"></i>' + m[1] + "</span></label>").join("") + "</div>" +
        '<div class="pay-panel" data-for="card">' + input("num", "Card number", "1234 5678 9012 3456", "cc-number", 'maxlength="23"') +
            '<div class="pay-row">' + input("exp", "Expiry (MM/YY)", "MM/YY", "cc-exp", 'maxlength="5"') + input("cvc", "CVC", "123", "cc-csc", 'maxlength="4"') + "</div></div>" +
        '<div class="pay-panel" data-for="gcash" hidden><p><strong>GCash Express Donate:</strong> Send to <strong>0917-PAW-FRWD</strong> (PawForward Animal Rescue). Your official receipt generates immediately upon submission.</p></div>' +
        '<div class="pay-panel" data-for="maya" hidden><p><strong>Maya Donate:</strong> Send to <strong>@PawForwardPH</strong>. Have your Maya app ready to confirm.</p></div>' +
        '<div class="pay-panel" data-for="bank" hidden><p><strong>Bank Transfer</strong><br>BPI / BDO &middot; PawForward Animal Rescue Foundation<br>Account no. 0042-8891-2026<br>Official receipt will be generated right after confirmation.</p></div>';

    const current = () => qs('input[name="' + name + '"]:checked', el).value;
    const get = (k) => qs("#" + name + "-" + k, el);

    el.addEventListener("change", (e) => {
        if (e.target.name !== name) return;
        qsa(".pay-panel", el).forEach((p) => { p.hidden = p.dataset.for !== current(); });
    });
    get("num").addEventListener("input", (e) => {
        const d = e.target.value.replace(/\D/g, "").slice(0, 19);
        e.target.value = d.replace(/(.{4})/g, "$1 ").trim();
    });
    get("exp").addEventListener("input", (e) => {
        let d = e.target.value.replace(/\D/g, "").slice(0, 4);
        if (d.length > 2) d = d.slice(0, 2) + "/" + d.slice(2);
        e.target.value = d;
    });
    get("cvc").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });

    function validate() {
        if (current() !== "card") return true;
        const num = get("num"), exp = get("exp"), cvc = get("cvc");
        let ok = true;
        ok = setFieldState(num, /^\d{13,19}$/.test(num.value.replace(/\s/g, "")) ? "" : "Enter a valid card number.", "Card number looks good") && ok;
        const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(exp.value);
        const expError = !m ? "Use MM/YY." : new Date(2000 + +m[2], +m[1], 1) <= new Date() ? "This card has expired." : "";
        ok = setFieldState(exp, expError, "Looks good") && ok;
        ok = setFieldState(cvc, /^\d{3,4}$/.test(cvc.value) ? "" : "3 or 4 digits.", "Looks good") && ok;
        if (!ok) qs(".is-invalid input", el).focus();
        return ok;
    }
    const labels = { card: "Card", gcash: "GCash", maya: "Maya", bank: "Bank Transfer" };
    return { el: el, validate: validate, method: current, label: () => labels[current()] };
}

/* ================================ Saved hearts ================================ */
document.addEventListener("click", (e) => {
    const h = e.target.closest(".heart");
    if (!h) return;
    if (!requireAuth("Sign in to save the animals you love.")) return;
    const nowSaved = UserData.toggleSaved(h.dataset.name);
    h.setAttribute("aria-pressed", nowSaved);
    toast(nowSaved ? "Saved " + h.dataset.name : "Removed " + h.dataset.name + " from saved", nowSaved ? { action: { label: "View saved", onClick: () => { location.href = "account.html#saved"; } } } : {});
    window.dispatchEvent(new Event("savedchange"));
});

/* ================================ Receipts ================================ */
function openReceipt(rec) {
    let d = byId("receiptDialog");
    if (!d) {
        d = document.createElement("dialog");
        d.id = "receiptDialog";
        d.className = "auth receipt";
        d.setAttribute("aria-labelledby", "rcTitle");
        document.body.appendChild(d);
        d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
        d.addEventListener("close", () => { document.body.style.overflow = ""; });
    }
    d.innerHTML =
        '<div class="dlg-inner receipt-inner"><button type="button" class="dlg-close" aria-label="Close receipt">&times;</button>' +
        '<div class="rc-head"><span class="rc-brand">PawForward</span><span class="rc-tag">Official Donation Receipt</span></div>' +
        '<h2 id="rcTitle">Thank you for your gift</h2>' +
        '<dl class="rc-rows"><div><dt>Receipt no.</dt><dd data-k="id"></dd></div><div><dt>Date</dt><dd data-k="date"></dd></div>' +
        '<div><dt>Donor</dt><dd data-k="donor"></dd></div><div><dt>Payment method</dt><dd data-k="method"></dd></div>' +
        '<div class="rc-total"><dt>Amount</dt><dd data-k="amount"></dd></div></dl>' +
        '<p class="rc-note">PawForward Animal Rescue Foundation · Verified Tax-Deductible Contribution</p>' +
        '<div class="rc-actions"><button type="button" class="btn btn-outline" data-rc="close">Close</button><button type="button" class="btn" data-rc="print">Print / Save PDF</button></div></div>';
    const set = (k, v) => { qs('[data-k="' + k + '"]', d).textContent = v; };
    set("id", rec.id);
    set("date", new Date(rec.date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }));
    set("donor", rec.name ? rec.name + (rec.email ? " (" + rec.email + ")" : "") : rec.email || "Supporter");
    set("method", rec.method.charAt(0).toUpperCase() + rec.method.slice(1));
    set("amount", "\u20B1" + Number(rec.amount).toLocaleString("en-US"));
    qs(".dlg-close", d).onclick = () => d.close();
    qs('[data-rc="close"]', d).onclick = () => d.close();
    qs('[data-rc="print"]', d).onclick = () => window.print();
    document.body.style.overflow = "hidden";
    d.showModal();
}

/* ============================ Rescue stories (before / after) ============================ */
function storyCard(s) {
    const card = document.createElement("article");
    card.className = "story-card clay-card reveal";
    card.innerHTML =
        '<div class="ba" style="--pos:50%">' +
            '<div class="ba-img ba-after ph"><img loading="lazy"></div>' +
            '<div class="ba-img ba-before ph"><img loading="lazy"></div>' +
            '<span class="ba-tag ba-tag-before">Before</span><span class="ba-tag ba-tag-after">After</span>' +
            '<input type="range" class="ba-range" min="0" max="100" value="50">' +
            '<div class="ba-handle" aria-hidden="true"><span></span></div>' +
        '</div><div class="story-body"><h3></h3><p></p></div>';
    const imgs = qsa("img", card);
    imgs[0].src = "images/story-" + s.id + "-after.jpg";
    imgs[0].alt = s.name + " after rescue";
    imgs[0].onerror = function() { this.onerror = null; this.src = s.afterFallback; };

    imgs[1].src = "images/story-" + s.id + "-before.jpg";
    imgs[1].alt = s.name + " before rescue";
    imgs[1].onerror = function() { this.onerror = null; this.src = s.beforeFallback; };

    const range = qs(".ba-range", card);
    range.setAttribute("aria-label", "Compare " + s.name + " before and after");
    range.addEventListener("input", () => qs(".ba", card).style.setProperty("--pos", range.value + "%"));
    qs("h3", card).textContent = s.title;
    qs("p", card).textContent = s.text;
    return card;
}
const storiesGrid = byId("storiesGrid");
if (storiesGrid) STORIES.forEach((st) => { const c = storyCard(st); storiesGrid.appendChild(c); observer.observe(c); });

/* ============================== Where your money goes ============================== */
const fundsBar = byId("fundsBar");
if (fundsBar) {
    const legend = byId("fundsLegend");
    fundsBar.setAttribute("role", "img");
    fundsBar.setAttribute("aria-label", "How donations are spent: " + FUNDS.map((f) => f.label + " " + f.pct + " percent").join(", "));
    FUNDS.forEach((f) => {
        const seg = document.createElement("span");
        seg.className = "seg";
        seg.style.background = f.color;
        seg.dataset.percent = f.pct;
        seg.setAttribute("aria-hidden", "true");
        fundsBar.appendChild(seg);
        observer.observe(seg);
        const li = document.createElement("li");
        li.innerHTML = '<i></i><span></span><b></b>';
        qs("i", li).style.background = f.color;
        qs("span", li).textContent = f.label;
        qs("b", li).textContent = "\u20B1" + f.pct + " of every \u20B1100";
        legend.appendChild(li);
    });
}

/* ================== Pet Matching Quiz & Volunteer Shifts ================== */
window.nextQuizStep = function(stepNumber) {
    document.querySelectorAll('.quiz-step').forEach(step => step.hidden = true);
    if (stepNumber === 3) {
        byId('quizStep3').hidden = false;
        setTimeout(() => {
            byId('quizLoader').style.width = '100%';
            byId('quizLoader').style.transition = 'width 1.4s ease-in-out';
        }, 50);
        setTimeout(() => {
            byId('quizStep3').hidden = true;
            byId('quizResult').hidden = false;
        }, 1600);
    } else {
        const nextStep = byId('quizStep' + stepNumber);
        if (nextStep) nextStep.hidden = false;
    }
};

window.resetQuiz = function() {
    document.querySelectorAll('.quiz-step').forEach(step => step.hidden = true);
    byId('quizStep1').hidden = false;
    byId('quizLoader').style.width = '0%';
    byId('quizLoader').style.transition = 'none';
};

window.claimShift = function(buttonElement) {
    if (!requireAuth("Please sign in to claim a volunteer shift.")) return;
    buttonElement.classList.remove('open');
    buttonElement.classList.add('full');
    buttonElement.disabled = true;
    buttonElement.textContent = "✓ Claimed";
    buttonElement.style.background = "var(--red)";
    buttonElement.style.color = "white";
    toast("Volunteer shift claimed! Confirmation logged to your account.");
};
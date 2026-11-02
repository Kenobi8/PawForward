/* account.js - My account page. Needs Core.js and script.js first. */
(function () {
    const money = (n) => "\u20B1" + Number(n).toLocaleString("en-US");
    const date = (iso) => new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    const tabs = qsa(".tab"), panels = qsa(".panel");
    function selectTab(name, focus) {
        tabs.forEach((t) => {
            const on = t.dataset.tab === name;
            t.setAttribute("aria-selected", on);
            t.tabIndex = on ? 0 : -1;
            if (on && focus) t.focus();
        });
        panels.forEach((p) => { p.hidden = p.id !== "panel-" + name; });
        history.replaceState(null, "", "#" + name);
    }
    tabs.forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.tab)));
    byId("tabs").addEventListener("keydown", (e) => {
        const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
        if (e.key === "ArrowRight") { e.preventDefault(); selectTab(tabs[(i + 1) % tabs.length].dataset.tab, true); }
        if (e.key === "ArrowLeft") { e.preventDefault(); selectTab(tabs[(i + tabs.length - 1) % tabs.length].dataset.tab, true); }
    });

    function empty(text, href, label) {
        return '<div class="panel-empty clay-card"><p>' + text + '</p><a href="' + href + '" class="btn">' + label + "</a></div>";
    }

    function renderDonations() {
        const list = UserData.donations(), box = byId("panel-donations");
        if (!list.length) { box.innerHTML = empty("No donations yet. Your first gift and its official tax receipt will show up here.", "donate.html", "Make a donation"); return; }
        box.innerHTML = '<ul class="rec-list"></ul>';
        const ul = qs("ul", box);
        list.forEach((d) => {
            const li = document.createElement("li");
            li.className = "rec clay-card";
            li.innerHTML = "<div><strong></strong><small></small></div><button type=\"button\" class=\"link-btn\">View receipt</button>";
            qs("strong", li).textContent = money(d.amount);
            qs("small", li).textContent = date(d.date) + " \u00B7 " + cap(d.method) + " \u00B7 " + d.id;
            qs("button", li).addEventListener("click", () => openReceipt(d));
            ul.appendChild(li);
        });
    }

    function renderSaved() {
        const names = UserData.saved(), box = byId("panel-saved");
        const list = ANIMALS.filter((a) => names.includes(a.name));
        if (!list.length) { box.innerHTML = empty("You haven't saved anyone yet. Tap the heart on an animal to keep them here.", "adopt.html", "Meet the animals"); return; }
        box.innerHTML = '<div class="animal-grid"></div>';
        list.forEach((a, i) => qs(".animal-grid", box).appendChild(animalCard(a, i)));
    }

    async function renderInquiries() {
        const box = byId("panel-inquiries");
        const user = Auth.current();
        let list = UserData.inquiries();

        // Sync live application statuses from Firestore if available
        if (user && window.PawFirebase) {
            const cloudList = await window.PawFirebase.fetchUserInquiriesFromCloud(user.email);
            if (cloudList && cloudList.length) {
                list = cloudList;
            }
        }

        byId("statInquiries").textContent = list.length;

        if (!list.length) {
            box.innerHTML = empty("No adoption inquiries yet. Message us about an animal and track your live approval status here.", "adopt.html", "Browse adoptable pets");
            return;
        }
        box.innerHTML = '<ul class="rec-list"></ul>';
        const ul = qs("ul", box);
        list.forEach((q) => {
            const li = document.createElement("li");
            li.className = "rec clay-card";
            li.innerHTML = '<div><strong></strong><small></small></div><span class="status"></span>';
            qs("strong", li).textContent = q.pet ? "Adoption Inquiry: " + q.pet : q.topic;
            qs("small", li).textContent = date(q.date) + " \u00B7 " + (q.message.length > 75 ? q.message.slice(0, 75) + "\u2026" : q.message);
            const st = qs(".status", li);
            st.textContent = q.status || "Pending Review";
            if (q.status === "Approved") {
                st.style.background = "#e6fcf5";
                st.style.color = "#087f5b";
                st.style.borderColor = "#087f5b";
            } else if (q.status === "Rejected") {
                st.style.background = "#ffe3e3";
                st.style.color = "#c92a2a";
                st.style.borderColor = "#c92a2a";
            }
            ul.appendChild(li);
        });
    }

    function fillProfile() {
        const p = Auth.profile();
        if (!p) return;
        byId("pfFirst").value = p.firstName || "";
        byId("pfLast").value = p.lastName || "";
        byId("pfCity").value = p.city || "";
        byId("pfPhone").value = p.phone || "";
        byId("pfEmail").textContent = "Signed in as " + p.email;
        clearFieldStates(byId("profileForm"));
    }

    function render() {
        const user = Auth.current();
        byId("accountGate").hidden = !!user;
        byId("accountApp").hidden = !user;
        byId("acctWelcome").textContent = user ? "Hi, " + user.firstName + ". Track your live adoption applications, saved animals, and official receipts here." : "Sign in to see your donations, saved animals and inquiries.";
        if (!user) return;
        const donations = UserData.donations();
        byId("statDonated").textContent = money(donations.reduce((s, d) => s + Number(d.amount), 0));
        byId("statSaved").textContent = UserData.saved().length;
        byId("statInquiries").textContent = UserData.inquiries().length;
        renderDonations();
        renderSaved();
        renderInquiries();
    }

    addPasswordToggles(byId("accountApp"));

    wireForm(byId("profileForm"), {
        pfFirst: { check: need("First name"), ok: "Looks good" },
        pfLast:  { check: () => "", ok: "" },
        pfCity:  { check: () => "", ok: "" },
        pfPhone: { check: (v) => !v.trim() || /^[0-9+\s()-]{7,}$/.test(v.trim()) ? "" : "Enter a valid mobile number.", ok: "" }
    }, () => {
        Auth.updateProfile({ firstName: byId("pfFirst").value, lastName: byId("pfLast").value, city: byId("pfCity").value, phone: byId("pfPhone").value });
        refreshAuth();
        render();
        toast("Profile saved");
    });

    wireForm(byId("passwordForm"), {
        pwCurrent: { check: need("Current password"), ok: "" },
        pwNew:     { check: pw8, ok: "Password is long enough" }
    }, () => {
        const r = Auth.changePassword(byId("pwCurrent").value, byId("pwNew").value);
        const err = byId("pwError");
        err.hidden = r.ok;
        if (!r.ok) { err.textContent = r.error; return; }
        byId("passwordForm").reset();
        clearFieldStates(byId("passwordForm"));
        toast("Password updated");
    });

    byId("gateSignIn").addEventListener("click", () => openAuth("Sign in to see your account."));
    byId("acctSignOut").addEventListener("click", () => { Auth.signOut(); refreshAuth(); render(); toast("You've been signed out."); });
    window.addEventListener("authchange", () => { render(); fillProfile(); });
    window.addEventListener("savedchange", render);
    window.addEventListener("cloudanimalssynced", renderSaved);

    const TAB_NAMES = ["donations", "saved", "inquiries", "profile"];
    window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TAB_NAMES.includes(h)) selectTab(h); });

    const start = location.hash.slice(1);
    selectTab(["donations", "saved", "inquiries", "profile"].includes(start) ? start : "donations");
    render();
    fillProfile();
})();
/* Cart.js - PawForward cart drawer and cart page management. */

const CART_KEY = "pawforwardCart";
const CURRENCY = "\u20B1";
const FREE_SHIPPING_OVER = 1000;
const SHIPPING_FEE = 80;
const OPEN_DRAWER_ON_ADD = false;

const money = (n) => CURRENCY + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
}
function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
}
function totals(cart) {
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
    return { subtotal, shipping, total: subtotal + shipping, count: cart.reduce((s, i) => s + i.qty, 0) };
}
function addToCart(item) {
    const cart = loadCart();
    const found = cart.find((i) => i.id === item.id);
    if (found) found.qty += 1; else cart.push({ ...item, qty: 1 });
    saveCart(cart);
}
function updateCartCount() {
    const count = totals(loadCart()).count;
    document.querySelectorAll("[data-cart]").forEach((a) => {
        const badge = a.querySelector(".cart-badge");
        if (badge) { badge.textContent = count; badge.hidden = !count; }
        else a.textContent = count ? "Cart (" + count + ")" : "Cart";
    });
}

function shipText(t) {
    return t.subtotal >= FREE_SHIPPING_OVER ? "You've unlocked free shipping!" : "Add " + money(FREE_SHIPPING_OVER - t.subtotal) + " more for free shipping";
}
const shipPercent = (t) => Math.min((t.subtotal / FREE_SHIPPING_OVER) * 100, 100);
function meterHTML(t) {
    const pct = shipPercent(t);
    return '<div class="ship-meter' + (t.subtotal >= FREE_SHIPPING_OVER ? " unlocked" : "") + '"><p>' + shipText(t) + "</p>" +
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '" aria-label="Free shipping progress"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';
}

/* ================================ Drawer ================================ */
const overlay = document.createElement("div");
overlay.className = "drawer-overlay";
const drawer = document.createElement("aside");
drawer.className = "drawer";
drawer.setAttribute("role", "dialog");
drawer.setAttribute("aria-modal", "true");
drawer.setAttribute("aria-label", "Your cart");
drawer.innerHTML =
    '<div class="drawer-head"><h2></h2><button type="button" class="drawer-close" aria-label="Close cart">&times;</button></div>' +
    '<div class="drawer-body"></div><div class="drawer-foot"></div>';
document.body.append(overlay, drawer);

let drawerPay = null;

function renderDrawer(mode) {
    const cart = loadCart(), t = totals(cart), summary = mode === "summary";
    drawer.classList.toggle("added", !summary);
    drawer.querySelector("h2").textContent = summary ? "Checkout summary" : "Added to your cart";

    const body = drawer.querySelector(".drawer-body");
    body.innerHTML = "";
    if (!cart.length) body.innerHTML = '<p class="drawer-empty">Your cart is empty.</p>';
    cart.forEach((item) => {
        const row = document.createElement("div");
        row.className = "d-item";
        row.innerHTML = '<img alt=""><div><h3></h3><p></p></div><span class="d-total"></span>';
        row.querySelector("img").src = item.img;
        row.querySelector("img").onerror = function () { this.removeAttribute("src"); };
        row.querySelector("h3").textContent = item.name;
        row.querySelector("p").textContent = item.qty + " \u00D7 " + money(item.price);
        row.querySelector(".d-total").textContent = money(item.price * item.qty);
        body.appendChild(row);
    });
    drawerPay = null;
    if (summary && cart.length) { drawerPay = paymentPicker(); body.appendChild(drawerPay.el); }

    const foot = drawer.querySelector(".drawer-foot");
    foot.innerHTML =
        meterHTML(t) +
        '<div class="row"><span>Subtotal</span><span>' + money(t.subtotal) + "</span></div>" +
        (summary
            ? '<div class="row"><span>Shipping</span><span>' + (t.shipping ? money(t.shipping) : "Free") + "</span></div>" +
              '<div class="row total"><span>Total</span><span>' + money(t.total) + "</span></div>"
            : "") +
        '<div class="drawer-actions"></div><p class="thanks" id="orderNote" role="status"></p>' +
        (!summary && !document.getElementById("cartList") ? '<a href="Cart.html" class="drawer-link">View full cart</a>' : "");

    foot.querySelector(".drawer-actions").innerHTML = summary
        ? '<button type="button" class="btn btn-outline" data-act="close">Keep shopping</button><button type="button" class="btn" data-act="order">Place order</button>'
        : '<button type="button" class="btn btn-outline" data-act="close">Continue shopping</button><button type="button" class="btn" data-act="checkout">Checkout</button>';
}

function openDrawer(mode) {
    renderDrawer(mode);
    overlay.classList.add("open");
    drawer.classList.add("open");
    document.body.style.overflow = "hidden";
    drawer.querySelector(".drawer-close").focus();
}
function closeDrawer() {
    overlay.classList.remove("open");
    drawer.classList.remove("open");
    document.body.style.overflow = "";
}

overlay.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
drawer.addEventListener("click", (e) => {
    if (e.target.closest(".drawer-close")) return closeDrawer();
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "close") closeDrawer();
    if (act.dataset.act === "checkout") renderDrawer("summary");
    if (act.dataset.act === "order") {
        if (drawerPay && !drawerPay.validate()) return;
        const note = document.getElementById("orderNote");
        note.textContent = "Order placed successfully! Paid by " + (drawerPay ? drawerPay.label() : "Selected Method") + ". Thank you for supporting PawForward rescue animals.";
        note.classList.add("show");
        toast("Order received! Thank you.");
        localStorage.removeItem(CART_KEY);
        updateCartCount();
    }
});

document.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-to-cart");
    if (!btn) return;
    e.preventDefault();
    addToCart({ id: btn.dataset.id, name: btn.dataset.name, price: parseFloat(btn.dataset.price), img: btn.dataset.img || "" });
    toast("Added to cart!", { action: { label: "Checkout", onClick: () => openDrawer("summary") } });
    if (OPEN_DRAWER_ON_ADD) openDrawer("added");
});

updateCartCount();

/* ============================== Cart page only ============================== */
const listEl = document.getElementById("cartList");
if (listEl) {
    const layout = document.getElementById("cartLayout");
    const emptyEl = document.getElementById("cartEmpty");

    function tween(el, to, text) {
        const from = +el.dataset.v || 0;
        el.dataset.v = to;
        if (text !== undefined) { el.textContent = text; return; }
        el.textContent = money(to);
    }

    function renderCart() {
        const cart = loadCart(), t = totals(cart);
        layout.hidden = cart.length === 0;
        emptyEl.hidden = cart.length > 0;
        listEl.innerHTML = "";
        cart.forEach((item) => {
            const row = document.createElement("article");
            row.className = "cart-item";
            row.dataset.id = item.id;
            row.innerHTML =
                '<img alt="">' +
                '<div><h3></h3><p class="unit"></p></div>' +
                '<div class="cart-side">' +
                    '<div class="qty"><button type="button" data-act="dec" aria-label="Decrease quantity">&minus;</button><span></span><button type="button" data-act="inc" aria-label="Increase quantity">+</button></div>' +
                    '<div class="line-total"></div>' +
                    '<button type="button" class="remove-btn" data-act="remove">Remove</button>' +
                '</div>';
            row.querySelector("img").src = item.img;
            row.querySelector("img").onerror = function () { this.removeAttribute("src"); };
            row.querySelector("h3").textContent = item.name;
            row.querySelector(".unit").textContent = money(item.price) + " each";
            row.querySelector(".qty span").textContent = item.qty;
            row.querySelector(".line-total").textContent = money(item.price * item.qty);
            listEl.appendChild(row);
        });

        tween(document.getElementById("barSubtotal"), t.subtotal);
        tween(document.getElementById("barShipping"), t.shipping, t.shipping ? undefined : "Free");
        tween(document.getElementById("barTotal"), t.total);

        const meter = document.getElementById("cartMeter");
        meter.classList.toggle("unlocked", t.subtotal >= FREE_SHIPPING_OVER);
        document.getElementById("meterText").textContent = shipText(t);
        document.getElementById("meterFill").style.width = shipPercent(t) + "%";
    }

    listEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const row = btn.closest(".cart-item");
        const cart = loadCart();
        const item = cart.find((i) => i.id === row.dataset.id);
        if (!item) return;
        if (btn.dataset.act === "remove") {
            row.classList.add("removing");
            setTimeout(() => { saveCart(cart.filter((i) => i.id !== item.id)); renderCart(); toast("Removed from cart"); }, 300);
            return;
        }
        if (btn.dataset.act === "inc") item.qty += 1;
        if (btn.dataset.act === "dec") item.qty = Math.max(1, item.qty - 1);
        saveCart(cart);
        renderCart();
    });

    document.getElementById("checkoutBtn").addEventListener("click", () => openDrawer("summary"));
    renderCart();
}
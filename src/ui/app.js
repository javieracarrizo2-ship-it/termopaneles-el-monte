/**
 * App.js - Catalog controller for Termopaneles Fijos
 * Fetches, parses, filters, sorts and displays products from CSV
 */

// Configuration
const CONFIG = {
    csvPath: 'inventario-termopaneles-landing.csv',
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSeHty4SN7j5L3ypMmiOSSlGYGOnd_qkU8LTwRO1aC55yZXMzPxdIQJ4MRQ6auYdhxpoMuS1R9nj_Ft/pub?output=csv',
    googleAppScriptUrl: 'https://script.google.com/macros/s/AKfycbwVi-UdNmBaw8XCAhNiQaDpY_-siYKAgWjnGDDTACbcCTpq65Th0hrvTffYRH1dIZGi5A/exec', // Web App de Google Apps Script para registro de cotizaciones
    whatsappNumber: '56977445451', // Chilean business WhatsApp number (+56 9 ...)
    lowStockThreshold: 5
};

// Helper: Formato de Fecha y Hora en zona horaria de Chile (es-CL, America/Santiago)
function getChileDateTime() {
    return new Date().toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Function to register quote in Google Sheets via Google Apps Script Web App
function recordQuoteToGoogleSheets(data) {
    if (!CONFIG.googleAppScriptUrl) {
        console.info('Registro en Google Sheets omitido (no se ha configurado googleAppScriptUrl en CONFIG).');
        return;
    }

    try {
        const payload = JSON.stringify({
            fecha: data.fecha || getChileDateTime(),
            medidas: data.medidas || '',
            total: data.total || '',
            vendido: 'Pendiente'
        });

        fetch(CONFIG.googleAppScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: payload
        }).catch(err => {
            console.error('Error al registrar cotización en Google Sheets:', err);
        });
    } catch (e) {
        console.error('Error al enviar cotización a Google Sheets:', e);
    }
}

// Application State
let appState = {
    products: [],
    filteredProducts: [],
    activeCategory: 'all',
    searchQuery: '',
    sortBy: 'dimensions-similar',
    cart: [],
    maxCatalogWidth: 120,
    maxCatalogHeight: 220,
    visibleCatalogLimit: 12
};

// DOM Elements
const DOM = {
productsGrid: document.getElementById('products-grid'),
loader: document.getElementById('inventory-loader'),
categoryTabs: document.getElementById('category-tabs'),
searchInput: document.getElementById('search-input'),
sortSelect: document.getElementById('sort-select'),
resultsCount: document.getElementById('results-count'),
activeFiltersInfo: document.getElementById('active-filters-info'),
// Cart Elements
cartDrawer: document.getElementById('cart-drawer'),
cartToggle: document.getElementById('cart-toggle-btn'),
cartClose: document.getElementById('cart-close-btn'),
cartOverlay: document.getElementById('cart-drawer-overlay'),
cartItemsList: document.getElementById('cart-items-list'),
cartEmptyState: document.getElementById('cart-empty-state'),
cartTotalUnits: document.getElementById('cart-total-units'),
cartUnitPrice: document.getElementById('cart-unit-price'),
cartTotalPrice: document.getElementById('cart-total-price'),
cartDiscountMessage: document.getElementById('cart-discount-message'),
cartCheckoutBtn: document.getElementById('cart-checkout-btn'),
cartCounter: document.getElementById('cart-counter'),
cartDrawerFooter: document.getElementById('cart-drawer-footer'),
// Mobile Menu
menuToggleBtn: document.getElementById('menu-toggle-btn'),
navMenu: document.getElementById('nav-menu')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
initApp();
});

async function initApp() {
setupEventListeners();
initCart();
initMobileMenu();
initStockCarousel();
initUnifiedSizing();
await loadInventory();
}

// Set up Event Listeners for Filters, Search, and Sort
function setupEventListeners() {
// Sizing Tabs Click
DOM.categoryTabs.addEventListener('click', (e) => {
const tab = e.target.closest('.tab-btn');
if (!tab) return;

// Update active tab styling
DOM.categoryTabs.querySelectorAll('.tab-btn').forEach(btn => {
btn.classList.remove('active');
btn.setAttribute('aria-selected', 'false');
});
tab.classList.add('active');
tab.setAttribute('aria-selected', 'true');

// Update State
appState.activeCategory = tab.dataset.category;
applyFiltersAndSort();
});

// Search input typing (with debouncing helper)
let searchTimeout;
DOM.searchInput.addEventListener('input', (e) => {
clearTimeout(searchTimeout);
searchTimeout = setTimeout(() => {
appState.searchQuery = e.target.value.toLowerCase().trim();
applyFiltersAndSort();
}, 150);
});

// Sort select change
DOM.sortSelect.addEventListener('change', (e) => {
appState.sortBy = e.target.value;
applyFiltersAndSort();
});
}

// Load Inventory CSV
async function loadInventory() {
showLoader(true);
let response;
let loadedFromSheet = false;

try {
// Intenta cargar desde Google Sheets si está configurado
if (CONFIG.googleSheetUrl) {
try {
response = await fetch(CONFIG.googleSheetUrl);
if (response.ok) {
loadedFromSheet = true;
console.log('Inventario cargado exitosamente desde Google Sheets');
} else {
console.warn(`Google Sheets retornó estado ${response.status}. Usando respaldo local.`);
}
} catch (sheetError) {
console.warn('Error al conectar con Google Sheets. Usando respaldo local:', sheetError);
}
}

// Si no hay respuesta o falló, usa el archivo local
if (!response || !response.ok) {
response = await fetch(CONFIG.csvPath);
if (!response.ok) {
throw new Error(`No se pudo cargar el archivo de inventario (${response.status})`);
}
console.log('Inventario cargado desde archivo local CSV');
}

const csvText = await response.text();
const parsedData = parseCSV(csvText);

// Process and validate parsed products
appState.products = parsedData
.map(row => processProductRow(row))
.filter(product => product !== null && product.unidades > 0); // Exclude products with 0 units

// Calculate max dimensions for dynamic scaling
appState.maxCatalogWidth = Math.max(...appState.products.map(p => p.ancho_cm), 120);
appState.maxCatalogHeight = Math.max(...appState.products.map(p => p.alto_cm), 220);

updateCategoryCountBadges();
applyFiltersAndSort();
} catch (error) {
console.error('Error al cargar inventario:', error);
showErrorState(error.message);
} finally {
showLoader(false);
}
}

// Parse CSV Text to Array of Objects
function parseCSV(text) {
const lines = text.split(/\r?\n/);
if (lines.length === 0 || !lines[0]) return [];

// Clean and split headers
const headers = lines[0].split(',').map(h => h.trim());
const result = [];

for (let i = 1; i < lines.length; i++) {
const line = lines[i].trim();
if (!line) continue;

const row = [];
let inQuotes = false;
let currentValue = '';

for (let j = 0; j < line.length; j++) {
const char = line[j];
if (char === '"') {
inQuotes = !inQuotes;
} else if (char === ',' && !inQuotes) {
row.push(currentValue.trim());
currentValue = '';
} else {
currentValue += char;
}
}
row.push(currentValue.trim());

if (row.length >= headers.length) {
const obj = {};
headers.forEach((header, index) => {
let val = row[index];
// Strip quotes if wrapped
if (val && val.startsWith('"') && val.endsWith('"')) {
val = val.substring(1, val.length - 1);
}
obj[header] = val;
});
result.push(obj);
}
}
return result;
}

// Convert CSV String row to parsed Product object
function processProductRow(row) {
try {
const ancho_cm = parseFloat(row.ancho_cm);
const alto_cm = parseFloat(row.alto_cm);
const unidades = parseInt(row.unidades, 10);

if (isNaN(ancho_cm) || isNaN(alto_cm) || isNaN(unidades)) {
return null; // Invalid entry
}

let ancho_m;
if (row.ancho_m !== undefined && row.ancho_m !== null && row.ancho_m !== '') {
ancho_m = parseFloat(row.ancho_m.toString().replace(',', '.'));
} else {
ancho_m = ancho_cm / 100;
}

let alto_m;
if (row.alto_m !== undefined && row.alto_m !== null && row.alto_m !== '') {
alto_m = parseFloat(row.alto_m.toString().replace(',', '.'));
} else {
alto_m = alto_cm / 100;
}

// Calculate Area for classification
const area = ancho_m * alto_m;

// Categorize by Size: Chico (<0.5m2), Mediano (0.5m2 to 1.2m2), Grande (>1.2m2)
let sizeCategory = 'chico';
if (area > 1.2) {
sizeCategory = 'grande';
} else if (area >= 0.5) {
sizeCategory = 'mediano';
}

return {
id: row.id || '',
tipo: row.tipo || 'Fijo',
ancho_cm,
alto_cm,
ancho_m,
alto_m,
unidades,
estado: row.estado || (unidades <= CONFIG.lowStockThreshold ? 'Bajo stock' : 'Disponible'),
medida_cm: row.medida_cm || `${ancho_cm} x ${alto_cm} cm`,
medida_m: row.medida_m || `${ancho_m} x ${alto_m} m`,
descripcion: row.descripcion || `Termopanel fijo ${ancho_cm} x ${alto_cm} cm`,
rack: row.rack || '',
area,
sizeCategory,
forma: (row.id === 'TPA014' || (row.descripcion && (row.descripcion.toLowerCase().includes('trapecio') || row.descripcion.toLowerCase().includes('inclinado')))) ? 'trapezoidal' : ((row.descripcion && row.descripcion.toLowerCase().includes('triang')) ? 'triangular' : 'rectangular')
};
} catch (e) {
console.warn('Error al procesar fila del inventario:', row, e);
return null;
}
}

// Calculate sizes counts to update tab labels
function updateCategoryCountBadges() {
const counts = {
all: appState.products.length,
chico: appState.products.filter(p => p.sizeCategory === 'chico').length,
mediano: appState.products.filter(p => p.sizeCategory === 'mediano').length,
grande: appState.products.filter(p => p.sizeCategory === 'grande').length
};

// Update labels in DOM
const allTab = document.getElementById('tab-all');
const chicoTab = document.getElementById('tab-chico');
const medianoTab = document.getElementById('tab-mediano');
const grandeTab = document.getElementById('tab-grande');

if (allTab) allTab.querySelector('span').textContent = `(${counts.all})`;
if (chicoTab) chicoTab.querySelector('span').textContent = `(${counts.chico})`;
if (medianoTab) medianoTab.querySelector('span').textContent = `(${counts.mediano})`;
if (grandeTab) grandeTab.querySelector('span').textContent = `(${counts.grande})`;
}// Filter and Sort the product lists based on State
function applyFiltersAndSort() {
    appState.visibleCatalogLimit = 12; // Reset limit when filters change
    let list = [...appState.products];

    // 1. Filter by category tab
    if (appState.activeCategory !== 'all') {
        list = list.filter(p => p.sizeCategory === appState.activeCategory);
    }

    // 2. Filter by search input (matching width, height, m, cm or general text)
    if (appState.searchQuery) {
        const query = appState.searchQuery;
        list = list.filter(p => {
            return p.medida_cm.toLowerCase().includes(query) ||
                p.medida_m.toLowerCase().includes(query) ||
                p.ancho_cm.toString().includes(query) ||
                p.alto_cm.toString().includes(query);
        });
    }

    // 3. Sort list
    list.sort((a, b) => {
        switch (appState.sortBy) {
            case 'dimensions-similar':
                const minA = Math.min(a.ancho_cm, a.alto_cm);
                const minB = Math.min(b.ancho_cm, b.alto_cm);
                if (Math.abs(minA - minB) > 0.001) {
                    return minA - minB;
                }
                const maxA = Math.max(a.ancho_cm, a.alto_cm);
                const maxB = Math.max(b.ancho_cm, b.alto_cm);
                return maxA - maxB;
            case 'stock-desc':
                return b.unidades - a.unidades;
            case 'area-asc':
                return a.area - b.area;
            case 'area-desc':
                return b.area - a.area;
            default:
                const dMinA = Math.min(a.ancho_cm, a.alto_cm);
                const dMinB = Math.min(b.ancho_cm, b.alto_cm);
                if (Math.abs(dMinA - dMinB) > 0.001) {
                    return dMinA - dMinB;
                }
                const dMaxA = Math.max(a.ancho_cm, a.alto_cm);
                const dMaxB = Math.max(b.ancho_cm, b.alto_cm);
                return dMaxA - dMaxB;
        }
    });

    appState.filteredProducts = list;
    renderGrid();
    renderStats();
}

// Render Products inside Grid
function renderGrid() {
    DOM.productsGrid.innerHTML = '';

    if (appState.filteredProducts.length === 0) {
        renderNoResults();
        return;
    }

    const limit = appState.visibleCatalogLimit || 12;
    const productsToRender = appState.filteredProducts.slice(0, limit);

    productsToRender.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.id = `card-${product.id}`;

        // Define stock class and text
        const isLowStock = product.estado.toLowerCase() === 'bajo stock' || product.unidades <= CONFIG.lowStockThreshold;
        const statusClass = isLowStock ? 'low-stock' : 'available';
        const statusText = isLowStock ? 'Bajo stock' : 'Disponible';

        // Sizing label translations
        const sizeLabelSpanish = {
            chico: 'Chico',
            mediano: 'Mediano',
            grande: 'Grande'
        }[product.sizeCategory];

        const maxWidth = appState.maxCatalogWidth || 140;
        const maxHeight = appState.maxCatalogHeight || 240;

        const maxScalePercent = 88;
        const minScalePercent = 25;
        const widthPercent = Math.max(minScalePercent, (product.ancho_cm / maxWidth) * maxScalePercent);
        const heightPercent = Math.max(minScalePercent, (product.alto_cm / maxHeight) * maxScalePercent);

        const isTriangular = product.forma === 'triangular';
        const isTrapezoidal = product.forma === 'trapezoidal';
        const isSpecialShape = isTriangular || isTrapezoidal;
        const glassRepClass = isSpecialShape ? 'glass-representation triangular-pane' : 'glass-representation';

        let glassContentHtml = '';
        if (isTriangular) {
            glassContentHtml = `
               <svg viewBox="0 0 100 100" class="glass-svg-triangle glass-pane-simulation" preserveAspectRatio="none" style="width: ${widthPercent}%; height: ${heightPercent}%;">
                   <defs>
                       <linearGradient id="glassGrad-${product.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                           <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.85" />
                           <stop offset="100%" stop-color="#bae6fd" stop-opacity="0.45" />
                       </linearGradient>
                   </defs>
                   <polygon points="4,4 4,96 96,96" fill="url(#glassGrad-${product.id})" class="outer-tri" />
                   <polygon points="12,12 12,88 88,88" class="inner-tri" />
                   <line x1="15" y1="40" x2="60" y2="85" class="glare-line" />
               </svg>
               <div class="glass-icon-wrapper">
                   <span class="size-category-badge">${sizeLabelSpanish}</span>
                   <span class="shape-badge">Triangular</span>
               </div>
           `;
        } else if (isTrapezoidal) {
            glassContentHtml = `
               <svg viewBox="0 0 100 100" class="glass-svg-triangle glass-pane-simulation" preserveAspectRatio="none" style="width: ${widthPercent}%; height: ${heightPercent}%;">
                   <defs>
                       <linearGradient id="glassGrad-${product.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                           <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.85" />
                           <stop offset="100%" stop-color="#bae6fd" stop-opacity="0.45" />
                       </linearGradient>
                   </defs>
                   <polygon points="4,4 30,4 96,96 4,96" fill="url(#glassGrad-${product.id})" class="outer-tri" />
                   <polygon points="12,12 32,12 88,88 12,88" class="inner-tri" />
                   <line x1="15" y1="40" x2="60" y2="85" class="glare-line" />
               </svg>
               <div class="glass-icon-wrapper">
                   <span class="size-category-badge">${sizeLabelSpanish}</span>
                   <span class="shape-badge">Inclinado</span>
               </div>
           `;
        } else {
            glassContentHtml = `
               <div class="glass-pane-simulation" style="width: ${widthPercent}%; height: ${heightPercent}%;"></div>
               <div class="glass-icon-wrapper">
                   <span class="size-category-badge">${sizeLabelSpanish}</span>
               </div>
           `;
        }

        const shapeDetailHtml = isTriangular ? `
               <li>
                   <span class="detail-label">Diseño</span>
                   <span class="detail-value highlight-shape">Con forma (Triangular)</span>
               </li>
        ` : (isTrapezoidal ? `
               <li>
                   <span class="detail-label">Diseño</span>
                   <span class="detail-value highlight-shape">Con forma (Inclinado / Trapecio)</span>
               </li>
        ` : '');

        card.innerHTML = `
           <div class="${glassRepClass}" aria-hidden="true">
               ${glassContentHtml}
           </div>
           
           <h3 class="product-size-title">
               ${product.ancho_cm} x ${product.alto_cm} <span>cm</span>
           </h3>
           
           <div class="product-meters">${product.ancho_m} x ${product.alto_m} m</div>
           
           <ul class="product-details-list">
               <li>
                   <span class="detail-label">Disponibilidad</span>
                   <span class="status-badge ${statusClass}">${statusText}</span>
               </li>
               <li>
                   <span class="detail-label">Unidades en stock</span>
                   <span class="detail-value">${product.unidades}</span>
               </li>
               ${shapeDetailHtml}
               <li>
                   <span class="detail-label">Vidrios</span>
                   <span class="detail-value">Doble 4mm</span>
               </li>
               <li>
                   <span class="detail-label">Separador</span>
                   <span class="detail-value">Bronce 11.5mm</span>
               </li>
               <li>
                   <span class="detail-label">Precio</span>
                   <span class="detail-value" style="font-weight: 700; color: var(--color-olive);">$25.000 c/u</span>
               </li>
           </ul>
           
           <div class="product-card-qty-row">
               <span class="qty-label">Cantidad:</span>
               <div class="product-qty-selector">
                   <button class="qty-btn" onclick="decrementProductQty('${product.id}')" aria-label="Restar una unidad">-</button>
                   <input type="number" class="qty-val-input" id="qty-val-${product.id}" value="1" min="1" max="${product.unidades}" readonly>
                   <button class="qty-btn" onclick="incrementProductQty('${product.id}', ${product.unidades})" aria-label="Sumar una unidad">+</button>
               </div>
           </div>
           
           <div class="product-actions">
                <button onclick="buyProductDirectly('${product.id}')" class="cta-button" id="btn-quote-${product.id}" style="background-color: var(--color-olive); color: white;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 448 512" style="margin-right: 8px;">
                        <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                    </svg>
                    Cotizar por WhatsApp
                </button>
               <button class="cta-button add-to-cart-btn" onclick="addToCart('${product.id}')" id="btn-add-cart-${product.id}">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                       <line x1="12" y1="5" x2="12" y2="19"></line>
                       <line x1="5" y1="12" x2="19" y2="12"></line>
                   </svg>
                   Añadir al Carrito
               </button>
           </div>
       `;

        DOM.productsGrid.appendChild(card);
    });

    // Render "Ver más medidas" button if there are remaining products
    if (appState.filteredProducts.length > limit) {
        const remaining = appState.filteredProducts.length - limit;
        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.id = 'catalog-load-more-container';
        loadMoreContainer.style.gridColumn = '1 / -1';
        loadMoreContainer.style.textAlign = 'center';
        loadMoreContainer.style.marginTop = '28px';
        loadMoreContainer.style.marginBottom = '10px';

        loadMoreContainer.innerHTML = `
            <button id="load-more-catalog-btn" class="cta-button primary-hero-btn" style="padding: 14px 32px; font-size: 1rem; font-weight: 700; border-radius: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: var(--shadow-md);">
                Ver más medidas (${remaining} restantes)
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
        `;

        DOM.productsGrid.appendChild(loadMoreContainer);

        document.getElementById('load-more-catalog-btn').addEventListener('click', () => {
            appState.visibleCatalogLimit = (appState.visibleCatalogLimit || 12) + 12;
            renderGrid();
        });
    }
}

// Helper functions for pricing and currency formatting
function getProductPrice(product) {
    if (!product) return 25000;
    // Look up in the master list if this is a cart item copy
    const masterProduct = appState.products && appState.products.find(p => p.id === product.id);
    if (masterProduct && masterProduct.precio !== undefined && masterProduct.precio !== null) {
        return Number(masterProduct.precio);
    }
    if (product.precio !== undefined && product.precio !== null) {
        return Number(product.precio);
    }
    return 25000;
}

function formatCLP(val) {
    return `$${Number(val).toLocaleString('es-CL')} CLP`;
}

// Direct purchase action on WhatsApp for a single product card
window.buyProductDirectly = function(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;

    const qtyInput = document.getElementById(`qty-val-${productId}`);
    const qty = qtyInput ? parseInt(qtyInput.value, 10) : 1;

    const unitPrice = getProductPrice(product);
    const totalCalc = qty * unitPrice;
    const totalPriceText = `$${totalCalc.toLocaleString('es-CL')}`;

    const codeOrDesc = product.id ? product.id : `${product.ancho_cm} × ${product.alto_cm} cm`;
    const countText = qty === 1 ? '1 termopanel' : `${qty} termopaneles`;
    const medidasSummary = `${product.ancho_cm} x ${product.alto_cm} cm (${qty} unidad${qty > 1 ? 'es' : ''})`;

    // Registrar cotización en Google Sheets
    recordQuoteToGoogleSheets({
        fecha: getChileDateTime(),
        medidas: medidasSummary,
        total: totalPriceText,
        vendido: 'Pendiente'
    });

    const message = `Hola, quiero cotizar ${countText} para mi proyecto.
Medida del vidrio: ${product.ancho_cm} × ${product.alto_cm} cm.
Alternativa seleccionada: ${codeOrDesc}.
Total estimado: ${totalPriceText}.
Quisiera confirmar disponibilidad y coordinar retiro en El Monte.`;

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
};

// Render Stats at bottom of filters
function renderStats() {
const count = appState.filteredProducts.length;
DOM.resultsCount.textContent = count === 1 
? '1 medida encontrada' 
: `${count} medidas encontradas`;

let filterText = '';
if (appState.activeCategory !== 'all') {
const categoryLabels = { chico: 'Chicos', mediano: 'Medianos', grande: 'Grandes' };
filterText += `Categoría: ${categoryLabels[appState.activeCategory]}`;
}

if (appState.searchQuery) {
if (filterText) filterText += ' | ';
filterText += `Búsqueda: "${appState.searchQuery}"`;
}

DOM.activeFiltersInfo.textContent = filterText;
}

// Render Empty/No Results View
function renderNoResults() {
DOM.productsGrid.innerHTML = `
       <div class="no-results" id="no-results-view">
           <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <circle cx="11" cy="11" r="8"></circle>
               <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
               <line x1="8" y1="11" x2="14" y2="11"></line>
           </svg>
           <h3>No encontramos medidas que coincidan</h3>
           <p>Prueba buscando otras dimensiones o limpia los filtros de búsqueda.</p>
           <button class="no-results-btn" onclick="clearFilters()" id="btn-clear-filters">Limpiar Filtros</button>
       </div>
   `;
}

// Global helper to clear inputs
window.clearFilters = function() {
DOM.searchInput.value = '';
appState.searchQuery = '';

// Reset tabs
DOM.categoryTabs.querySelectorAll('.tab-btn').forEach(btn => {
btn.classList.remove('active');
btn.setAttribute('aria-selected', 'false');
});
const allTab = document.getElementById('tab-all');
if (allTab) {
allTab.classList.add('active');
allTab.setAttribute('aria-selected', 'true');
}

appState.activeCategory = 'all';
applyFiltersAndSort();
};

// Loader helpers
function showLoader(show) {
if (DOM.loader) {
DOM.loader.style.display = show ? 'flex' : 'none';
}
}

// Show Error View if fetching/loading fails
function showErrorState(message) {
DOM.productsGrid.innerHTML = `
       <div class="no-results" style="border-color: var(--color-low-stock-bg); background-color: #fffbfa;" id="error-view">
           <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-low-stock)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
               <line x1="12" y1="8" x2="12" y2="12"></line>
               <line x1="12" y1="16" x2="12.01" y2="16"></line>
           </svg>
           <h3 style="color: var(--color-low-stock);">Error al cargar el catálogo</h3>
           <p>${message}</p>
           <button class="no-results-btn" style="background-color: var(--color-low-stock); color: white;" onclick="location.reload()" id="btn-reload">Intentar de nuevo</button>
       </div>
   `;
}

// ==========================================================================
// Shopping Cart and Mobile Navigation Functionality
// ==========================================================================

// Initialize Shopping Cart Logic and Event Listeners
function initCart() {
// Load cart from localStorage
appState.cart = JSON.parse(localStorage.getItem('termopaneles_cart')) || [];
updateCartUI();

// Toggle Drawer Open
if (DOM.cartToggle) {
DOM.cartToggle.addEventListener('click', () => {
openCart(true);
});
}

// Toggle Drawer Close
if (DOM.cartClose) {
DOM.cartClose.addEventListener('click', () => {
openCart(false);
});
}

// Overlay Close
if (DOM.cartOverlay) {
DOM.cartOverlay.addEventListener('click', () => {
openCart(false);
});
}

// Cart Checkout
if (DOM.cartCheckoutBtn) {
DOM.cartCheckoutBtn.addEventListener('click', () => {
checkoutCart();
});
}
}

// Toggle drawer state
function openCart(open) {
if (DOM.cartDrawer) {
DOM.cartDrawer.setAttribute('aria-hidden', !open);
}
// Close mobile menu to prevent overlap
if (open && DOM.menuToggleBtn && DOM.menuToggleBtn.classList.contains('active')) {
DOM.menuToggleBtn.classList.remove('active');
DOM.navMenu.classList.remove('active');
}
}

// Initialize Mobile Menu listeners
function initMobileMenu() {
if (DOM.menuToggleBtn && DOM.navMenu) {
DOM.menuToggleBtn.addEventListener('click', () => {
DOM.menuToggleBtn.classList.toggle('active');
DOM.navMenu.classList.toggle('active');
// Close cart drawer if open
openCart(false);
});

// Close menu when clicking nav link
DOM.navMenu.addEventListener('click', (e) => {
if (e.target.classList.contains('nav-link')) {
DOM.menuToggleBtn.classList.remove('active');
DOM.navMenu.classList.remove('active');
}
});
}
}

// Product card quantity selectors
window.incrementProductQty = function(productId, maxVal) {
const input = document.getElementById(`qty-val-${productId}`);
if (input) {
let val = parseInt(input.value, 10);
if (val < maxVal) {
input.value = val + 1;
} else {
alert(`No puedes agregar más unidades de esta medida. Stock disponible: ${maxVal}`);
}
}
};

window.decrementProductQty = function(productId) {
const input = document.getElementById(`qty-val-${productId}`);
if (input) {
let val = parseInt(input.value, 10);
if (val > 1) {
input.value = val - 1;
}
}
};

// Add termopanel to cart
window.addToCart = function(productId) {
const product = appState.products.find(p => p.id === productId);
if (!product) return;

// Get selected quantity from input selector in the card
const qtyInput = document.getElementById(`qty-val-${productId}`);
const selectedQty = qtyInput ? parseInt(qtyInput.value, 10) : 1;

// Find if already in cart
const cartItem = appState.cart.find(item => item.id === productId);

if (cartItem) {
// Check stock availability
if (cartItem.qty + selectedQty > product.unidades) {
alert(`No puedes agregar esa cantidad. Total en el carro superaría el stock disponible de ${product.unidades}`);
return;
}
cartItem.qty += selectedQty;
} else {
appState.cart.push({
id: product.id,
ancho_cm: product.ancho_cm,
alto_cm: product.alto_cm,
medida_cm: product.medida_cm,
forma: product.forma,
qty: selectedQty,
maxQty: product.unidades
});
}

// Save state
saveCart();
updateCartUI();
// Open drawer as confirmation feedback
openCart(true);
};

// Update quantity
window.updateCartQty = function(productId, delta) {
const cartItem = appState.cart.find(item => item.id === productId);
if (!cartItem) return;

const newQty = cartItem.qty + delta;
if (newQty < 1) {
removeFromCart(productId);
return;
}

if (newQty > cartItem.maxQty) {
alert(`No puedes solicitar más unidades. Stock disponible en bodega: ${cartItem.maxQty}`);
return;
}

cartItem.qty = newQty;
saveCart();
updateCartUI();
};

// Remove item from cart
window.removeFromCart = function(productId) {
appState.cart = appState.cart.filter(item => item.id !== productId);
saveCart();
updateCartUI();
};

// Save cart to localStorage
function saveCart() {
localStorage.setItem('termopaneles_cart', JSON.stringify(appState.cart));
}

// Get unit price based on total items in cart (tiered pricing logic)
function getProductPriceByTotalQuantity(totalQty) {
    if (totalQty >= 40) {
        return 15000;
    } else if (totalQty >= 10) {
        return 20000;
    } else {
        return 25000;
    }
}

// Update Cart Drawer UI elements
function updateCartUI() {
const totalUnits = appState.cart.reduce((sum, item) => sum + item.qty, 0);

// Update badge counters
if (DOM.cartCounter) DOM.cartCounter.textContent = totalUnits;

if (totalUnits === 0) {
if (DOM.cartEmptyState) DOM.cartEmptyState.style.display = 'flex';
if (DOM.cartItemsList) DOM.cartItemsList.style.display = 'none';
if (DOM.cartDrawerFooter) DOM.cartDrawerFooter.style.display = 'none';
return;
}

if (DOM.cartEmptyState) DOM.cartEmptyState.style.display = 'none';
if (DOM.cartItemsList) DOM.cartItemsList.style.display = 'block';
if (DOM.cartDrawerFooter) DOM.cartDrawerFooter.style.display = 'block';

// Calculate volume discount unit price
const unitPrice = getProductPriceByTotalQuantity(totalUnits);
const totalPrice = totalUnits * unitPrice;

if (DOM.cartTotalUnits) DOM.cartTotalUnits.textContent = totalUnits;
if (DOM.cartUnitPrice) DOM.cartUnitPrice.textContent = `$${unitPrice.toLocaleString('es-CL')} c/u`;
if (DOM.cartTotalPrice) DOM.cartTotalPrice.textContent = `$${totalPrice.toLocaleString('es-CL')} CLP`;

// Update tier messaging
if (DOM.cartDiscountMessage) {
if (totalUnits < 10) {
const needed = 10 - totalUnits;
DOM.cartDiscountMessage.innerHTML = `💡 ¡Agrega <strong>${needed}</strong> unidad(es) más para precio mayorista ($20.000 c/u)!`;
} else if (totalUnits < 40) {
const needed = 40 - totalUnits;
DOM.cartDiscountMessage.innerHTML = `🎉 ¡Llegaste a precio Mayorista! Agrega <strong>${needed}</strong> más para Súper Mayorista ($15.000 c/u).`;
} else {
DOM.cartDiscountMessage.innerHTML = `🔥 ¡Felicidades! Obtuviste el máximo descuento Súper Mayorista ($15.000 c/u).`;
}
}

// Render Cart List Items
DOM.cartItemsList.innerHTML = '';
appState.cart.forEach(item => {
const itemElement = document.createElement('div');
itemElement.className = 'cart-item';
itemElement.id = `cart-item-${item.id}`;

const isTriangular = item.forma === 'triangular';
const isTrapezoidal = item.forma === 'trapezoidal';
const shapeLabel = isTriangular ? ' (Triangular)' : (isTrapezoidal ? ' (Inclinado)' : '');

itemElement.innerHTML = `
           <div class="cart-item-thumb" aria-hidden="true">
               <div class="cart-item-glass-pane"></div>
           </div>
           
           <div class="cart-item-details">
               <div class="cart-item-title">${item.medida_cm}${shapeLabel}</div>
               <div class="cart-item-sub">Stock Máx: ${item.maxQty} u | <strong style="color: var(--color-olive); font-weight: 600;">$${unitPrice.toLocaleString('es-CL')} c/u</strong></div>
               
               <div class="cart-qty-controls">
                   <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)" aria-label="Restar una unidad">-</button>
                   <span class="qty-val">${item.qty}</span>
                   <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)" aria-label="Sumar una unidad">+</button>
               </div>
           </div>
           
           <button class="cart-remove-btn" onclick="removeFromCart('${item.id}')" aria-label="Eliminar de la cotización">
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <polyline points="3 6 5 6 21 6"></polyline>
                   <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                   <line x1="10" y1="11" x2="10" y2="17"></line>
                   <line x1="14" y1="11" x2="14" y2="17"></line>
               </svg>
           </button>
       `;
DOM.cartItemsList.appendChild(itemElement);
});
}

// Generate consolidated WhatsApp quote link
function checkoutCart() {
    if (appState.cart.length === 0) return;

    let totalEstimado = 0;
    let totalUnidades = 0;

    const medidasArray = [];
    appState.cart.forEach(item => {
        const unitPrice = getProductPrice(item);
        const subtotal = item.qty * unitPrice;
        totalEstimado += subtotal;
        totalUnidades += item.qty;
        medidasArray.push(`${item.ancho_cm} x ${item.alto_cm} cm (${item.qty} unidad${item.qty > 1 ? 'es' : ''})`);
    });

    const totalText = `$${totalEstimado.toLocaleString('es-CL')}`;
    const medidasSummary = medidasArray.join(', ');

    // Registrar cotización en Google Sheets (asíncrono, no bloqueante)
    recordQuoteToGoogleSheets({
        fecha: getChileDateTime(),
        medidas: medidasSummary,
        total: totalText,
        vendido: 'Pendiente'
    });

    const itemsText = appState.cart.map((item, index) => {
        const unitPrice = getProductPrice(item);
        const subtotal = item.qty * unitPrice;
        return `${index + 1}) Termopanel fijo ${item.ancho_cm} × ${item.alto_cm} cm
Cantidad: ${item.qty} unidad(es)
Subtotal: $${subtotal.toLocaleString('es-CL')}`;
    }).join('\n\n');

    const message = `Hola, quiero cotizar ${totalUnidades} termopaneles para mi proyecto:

${itemsText}

Total estimado: ${totalText}.
Quisiera confirmar disponibilidad y coordinar retiro en El Monte.`;

    appState.cart = [];
    saveCart();
    updateCartUI();
    openCart(false);

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
}

// Carousel initialization for Real Stock photos
function initStockCarousel() {
const track = document.getElementById('carousel-track');
const slides = Array.from(track ? track.children : []);
const prevBtn = document.getElementById('carousel-prev');
const nextBtn = document.getElementById('carousel-next');
const indicatorsContainer = document.getElementById('carousel-indicators');

if (!track || slides.length === 0) return;

let currentIndex = 0;
let startX = 0;
let isDragging = false;

// Create indicators dynamically
slides.forEach((_, index) => {
const dot = document.createElement('button');
dot.className = index === 0 ? 'indicator-dot active' : 'indicator-dot';
dot.setAttribute('aria-label', `Ir a foto ${index + 1}`);
dot.addEventListener('click', () => goToSlide(index));
indicatorsContainer.appendChild(dot);
});

const dots = Array.from(indicatorsContainer.children);

function updateCarouselUI() {
track.style.transform = `translateX(-${currentIndex * 100}%)`;

// Update dots active class
dots.forEach((dot, index) => {
dot.classList.toggle('active', index === currentIndex);
});
}

function goToSlide(index) {
if (index < 0) {
currentIndex = slides.length - 1;
} else if (index >= slides.length) {
currentIndex = 0;
} else {
currentIndex = index;
}
updateCarouselUI();
}

// Button listeners
if (prevBtn) prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
if (nextBtn) nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));

// Touch / Swipe support for mobile devices
track.addEventListener('touchstart', (e) => {
startX = e.touches[0].clientX;
isDragging = true;
}, { passive: true });

track.addEventListener('touchend', (e) => {
if (!isDragging) return;
const endX = e.changedTouches[0].clientX;
const diffX = startX - endX;

if (Math.abs(diffX) > 40) { // minimum threshold for swipe
if (diffX > 0) {
goToSlide(currentIndex + 1); // swipe left -> next
} else {
goToSlide(currentIndex - 1); // swipe right -> prev
}
}
isDragging = false;
}, { passive: true });
}

// ==========================================================================
// Unified Sizing & Coverage Logic (Calculadora + Planificador)
// ==========================================================================

function initUnifiedSizing() {
    const widthInput = document.getElementById('sizing-width');
    const heightInput = document.getElementById('sizing-height');
    const searchBtn = document.getElementById('sizing-search-btn');

    if (!searchBtn) return;

    searchBtn.addEventListener('click', () => {
        const wVal = parseFloat(widthInput.value);
        const hVal = parseFloat(heightInput.value);

        if (isNaN(wVal) || isNaN(hVal) || wVal <= 0 || hVal <= 0) {
            alert('Por favor, ingresa dimensiones válidas en centímetros.');
            return;
        }

        runUnifiedSearch(wVal, hVal);
    });
}

window.switchSizingMode = function(mode) {
    const cardIndiv = document.getElementById('mode-card-individual');
    const cardVano = document.getElementById('mode-card-vano');
    const badgeIndiv = document.getElementById('mode-badge-individual');
    const badgeVano = document.getElementById('mode-badge-vano');
    const titleContext = document.getElementById('mode-context-title');
    const textContext = document.getElementById('mode-context-text');
    const helpContext = document.getElementById('mode-context-help');
    const labelWidth = document.getElementById('sizing-width-label');
    const labelHeight = document.getElementById('sizing-height-label');
    const inputWidth = document.getElementById('sizing-width');
    const inputHeight = document.getElementById('sizing-height');
    const advOptions = document.getElementById('sizing-advanced-options');

    if (mode === 'individual') {
        if (cardIndiv) cardIndiv.classList.add('active');
        if (cardVano) cardVano.classList.remove('active');
        if (badgeIndiv) badgeIndiv.textContent = '✓ Seleccionado';
        if (badgeVano) badgeVano.textContent = 'Opción 2';

        if (titleContext) titleContext.textContent = 'Ingresa la medida exacta que necesitas';
        if (textContext) textContext.textContent = 'Buscaremos si existe un termopanel individual igual o parecido en stock.';
        if (helpContext) helpContext.style.display = 'none';

        if (labelWidth) labelWidth.textContent = 'Ancho deseado (cm)';
        if (labelHeight) labelHeight.textContent = 'Alto deseado (cm)';
        if (inputWidth) inputWidth.placeholder = 'Ej: 80';
        if (inputHeight) inputHeight.placeholder = 'Ej: 120';

        if (advOptions) advOptions.style.display = 'none';
    } else {
        if (cardVano) cardVano.classList.add('active');
        if (cardIndiv) cardIndiv.classList.remove('active');
        if (badgeVano) badgeVano.textContent = '✓ Seleccionado';
        if (badgeIndiv) badgeIndiv.textContent = 'Opción 1';

        if (titleContext) titleContext.textContent = 'Ingresa las medidas totales de tu espacio';
        if (textContext) textContext.textContent = 'Buscaremos alternativas usando los termopaneles disponibles.';
        if (helpContext) helpContext.style.display = 'block';

        if (labelWidth) labelWidth.textContent = 'Ancho total del espacio (cm)';
        if (labelHeight) labelHeight.textContent = 'Alto total del espacio (cm)';
        if (inputWidth) inputWidth.placeholder = 'Ej: 300';
        if (inputHeight) inputHeight.placeholder = 'Ej: 240';

        if (advOptions) advOptions.style.display = 'block';
    }

    // Re-run search if dimensions exist
    const wVal = parseFloat(inputWidth.value);
    const hVal = parseFloat(inputHeight.value);
    if (!isNaN(wVal) && !isNaN(hVal) && wVal > 0 && hVal > 0) {
        runUnifiedSearch(wVal, hVal);
    }
};

function runUnifiedSearch(wVal, hVal) {
    const cardIndiv = document.getElementById('mode-card-individual');
    const isIndividualMode = cardIndiv && cardIndiv.classList.contains('active');
    const resultsContainer = document.getElementById('sizing-results');

    if (!resultsContainer) return;

    if (isIndividualMode) {
        runSinglePanelSearch(wVal, hVal, resultsContainer);
    } else {
        runVanoPlannerSearch(wVal, hVal, resultsContainer);
    }
}

// Option 1: Search single panel matches
function runSinglePanelSearch(userWidth, userHeight, container) {
    container.innerHTML = '';

    const exactMatch = appState.products.find(p => p.ancho_cm === userWidth && p.alto_cm === userHeight);

    let similarProducts = [...appState.products].map(p => {
        const wDiff = p.ancho_cm - userWidth;
        const hDiff = p.alto_cm - userHeight;
        const totalDiff = Math.abs(wDiff) + Math.abs(hDiff);
        return { product: p, wDiff, hDiff, totalDiff };
    });

    similarProducts.sort((a, b) => a.totalDiff - b.totalDiff);
    const bestSimilar = similarProducts.slice(0, 4);

    if (exactMatch) {
        const exactWrap = document.createElement('div');
        exactWrap.className = 'exact-match-badge-wrap';
        exactWrap.innerHTML = `<span class="exact-badge">🎯 ¡Medida Exacta en Stock!</span>`;
        container.appendChild(exactWrap);
        renderSingleProductCard(exactMatch, 0, 0, container);
    } else {
        const noExactMsg = document.createElement('div');
        noExactMsg.className = 'no-exact-msg';
        noExactMsg.innerHTML = `<p>No tenemos la medida exacta <strong>${userWidth} x ${userHeight} cm</strong> en stock, pero aquí tienes las <strong>medidas más cercanas disponibles</strong>:</p>`;
        container.appendChild(noExactMsg);

        bestSimilar.forEach(item => {
            renderSingleProductCard(item.product, item.wDiff, item.hDiff, container);
        });
    }
}

function renderSingleProductCard(product, wDiff, hDiff, container) {
    const card = document.createElement('div');
    card.className = 'calc-result-card';
    card.style.marginBottom = '16px';

    const formatDiff = (diff, axis) => {
        const axisText = axis === 'w' ? 'ancho' : 'alto';
        if (Math.abs(diff) < 0.01) {
            return `<span class="diff-tag exact">${axisText === 'ancho' ? 'Ancho exacto' : 'Alto exacto'}</span>`;
        }
        const absVal = Math.abs(diff);
        const roundedVal = (Math.round(absVal * 10) / 10).toString().replace('.', ',');

        if (diff > 0) {
            return `<span class="diff-tag plus">${roundedVal} cm ${axisText === 'ancho' ? 'más ancho' : 'más alto'}</span>`;
        } else {
            return `<span class="diff-tag minus">${roundedVal} cm ${axisText === 'ancho' ? 'más angosto' : 'más bajo'}</span>`;
        }
    };

    const wTag = formatDiff(wDiff, 'w');
    const hTag = formatDiff(hDiff, 'h');
    const unitPrice = getProductPrice(product);

    card.innerHTML = `
        <div class="calc-result-header">
            <h3 class="calc-result-title">${product.ancho_cm} x ${product.alto_cm} <span>cm</span></h3>
            <span class="size-category-badge">${product.sizeCategory === 'chico' ? 'Chico' : (product.sizeCategory === 'mediano' ? 'Mediano' : 'Grande')}</span>
        </div>
        <div class="calc-diff-info">
            ${wTag}
            ${hTag}
        </div>
        <div class="calc-result-footer">
            <span class="calc-stock-info">Stock: <strong>${product.unidades} u</strong> | ${formatCLP(unitPrice)}</span>
            <button class="calc-action-btn" onclick="buyProductDirectly('${product.id}')" style="background-color: var(--color-olive); color: white;">Consultar disponibilidad por WhatsApp</button>
        </div>
    `;
    container.appendChild(card);
}

// Option 2: Search Vano Coverage Combinations
function runVanoPlannerSearch(targetW, targetH, container) {
    const maxPanesVal = document.getElementById('planner-panes').value;
    const distType = document.getElementById('planner-distribution').value;
    const priority = document.getElementById('planner-priority').value;
    const tolerance = parseFloat(document.getElementById('planner-tolerance').value);
    const allowRotation = document.getElementById('planner-rotation').value;

    container.innerHTML = `<div style="text-align: center; padding: 20px;"><div class="spinner" style="margin: 0 auto 10px;"></div><p>Calculando mejores distribuciones...</p></div>`;

    setTimeout(() => {
        const proposals = findCoverageCombinationsAdvanced(
            targetW, targetH, maxPanesVal, distType, priority, allowRotation, tolerance, appState.products
        );
        renderPlannerProposals(proposals, targetW, targetH, container);
    }, 50);
}

// Algoritmo de Búsqueda Avanzado de Cobertura
function findCoverageCombinationsAdvanced(targetW, targetH, maxPanesStr, distType, priority, allowRotationStr, tolerance, inventory) {
    const maxPanes = maxPanesStr === 'all' ? 8 : parseInt(maxPanesStr, 10);
    const allowRotation = allowRotationStr === 'yes';

    let alternatives = [];

    // 1. Cobertura con paño único (1 paño)
    if (distType === 'auto' || distType === 'row' || distType === 'column') {
        inventory.forEach(item => {
            if (item.unidades < 1) return;
            checkSinglePane(item, item.ancho_cm, item.alto_cm, false);
            if (allowRotation && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
                checkSinglePane(item, item.alto_cm, item.ancho_cm, true);
            }
        });
    }

    function checkSinglePane(item, w, h, rotated) {
        if (Math.abs(w - targetW) <= tolerance && Math.abs(h - targetH) <= tolerance) {
            alternatives.push({
                type: 'single',
                score: 0,
                proposal: {
                    type: 'single',
                    totalWidth: w,
                    totalHeight: h,
                    widthDiff: w - targetW,
                    heightDiff: h - targetH,
                    unitCount: 1,
                    totalPrice: getProductPrice(item),
                    panes: [{ product: item, rotated, width: w, height: h }]
                }
            });
        }
    }

    // 2. Fila horizontal / Paños en paralelo (1 fila x N columnas)
    if (distType === 'auto' || distType === 'column' || distType === 'row') {
        const rowCombos = findRowCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory);
        rowCombos.forEach(combo => {
            const totalPrice = combo.panes.reduce((sum, p) => sum + getProductPrice(p.product), 0);
            alternatives.push({
                type: 'row',
                score: 0,
                proposal: {
                    type: 'row',
                    totalWidth: combo.totalWidth,
                    totalHeight: combo.totalHeight,
                    widthDiff: combo.widthDiff,
                    heightDiff: combo.heightDiff,
                    unitCount: combo.panes.length,
                    totalPrice,
                    panes: combo.panes
                }
            });
        });
    }

    // 3. Columna / Dos filas (2 filas x N columnas)
    if (distType === 'auto' || distType === 'two-rows' || distType === 'grid') {
        const gridCombos = findTwoRowCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory);
        gridCombos.forEach(combo => {
            const totalPrice = combo.panes.reduce((sum, p) => sum + getProductPrice(p.product), 0);
            alternatives.push({
                type: 'two-rows',
                score: 0,
                proposal: {
                    type: 'two-rows',
                    totalWidth: combo.totalWidth,
                    totalHeight: combo.totalHeight,
                    widthDiff: combo.widthDiff,
                    heightDiff: combo.heightDiff,
                    unitCount: combo.panes.length,
                    totalPrice,
                    panes: combo.panes
                }
            });
        });
    }

    // 4. Cuadrícula R x C
    if (distType === 'auto' || distType === 'grid') {
        const gridMatCombos = findGridCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory);
        gridMatCombos.forEach(combo => {
            const totalPrice = combo.panes.reduce((sum, p) => sum + getProductPrice(p.product), 0);
            alternatives.push({
                type: 'grid',
                score: 0,
                proposal: {
                    type: 'grid',
                    totalWidth: combo.totalWidth,
                    totalHeight: combo.totalHeight,
                    widthDiff: combo.widthDiff,
                    heightDiff: combo.heightDiff,
                    unitCount: combo.panes.length,
                    totalPrice,
                    panes: combo.panes
                }
            });
        });
    }

    // Calcular Score para ordenamiento
    alternatives.forEach(alt => {
        const p = alt.proposal;
        const absWDiff = Math.abs(p.widthDiff);
        const absHDiff = Math.abs(p.heightDiff);
        const diffScore = (absWDiff * 2) + (absHDiff * 2);
        const panePenalty = p.unitCount * 5;

        let score = diffScore + panePenalty;

        if (priority === 'joints') {
            score += p.unitCount * 15;
        } else if (priority === 'coverage') {
            score = (absWDiff * 5) + (absHDiff * 5) + p.unitCount;
        } else if (priority === 'gaps') {
            score = (absWDiff * 10) + (absHDiff * 10);
        } else if (priority === 'stock') {
            const lowStockCount = p.panes.filter(pane => pane.product.unidades < 3).length;
            score += lowStockCount * 20;
        }

        alt.score = score;
    });

    alternatives.sort((a, b) => a.score - b.score);

    // Filtrar propuestas duplicadas en dimensiones
    const uniqueProps = [];
    const seenSignatures = new Set();

    alternatives.forEach(alt => {
        const p = alt.proposal;
        const signature = `${p.unitCount}_${p.totalWidth.toFixed(1)}_${p.totalHeight.toFixed(1)}_${p.totalPrice}`;
        if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature);
            uniqueProps.push(alt);
        }
    });

    return uniqueProps.slice(0, 6);
}

// Búsqueda de Fila Horizontal de N columnas
function findRowCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory) {
    const availableItems = inventory.filter(item => item.unidades > 0);
    const results = [];

    // Filtrar vidrios que coincidan en alto dentro de la tolerancia
    const eligibleHeights = new Set();
    availableItems.forEach(item => {
        if (Math.abs(item.alto_cm - targetH) <= tolerance) eligibleHeights.add(item.alto_cm);
        if (allowRotation && Math.abs(item.ancho_cm - targetH) <= tolerance) eligibleHeights.add(item.ancho_cm);
    });

    eligibleHeights.forEach(h => {
        const candidates = [];
        availableItems.forEach(item => {
            let matchesNormal = Math.abs(item.alto_cm - h) < 0.01;
            let matchesRotated = allowRotation && Math.abs(item.ancho_cm - h) < 0.01;

            if (matchesNormal) {
                candidates.push({
                    product: item,
                    rotated: false,
                    width: item.ancho_cm,
                    height: item.alto_cm
                });
            }
            if (matchesRotated && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
                candidates.push({
                    product: item,
                    rotated: true,
                    width: item.alto_cm,
                    height: item.ancho_cm
                });
            }
        });

        // Combinaciones de 2 paños iguales o distintos
        for (let i = 0; i < candidates.length; i++) {
            for (let j = i; j < candidates.length; j++) {
                const c1 = candidates[i];
                const c2 = candidates[j];

                if (c1.product.id === c2.product.id && c1.product.unidades < 2) continue;

                const comboW = c1.width + c2.width;
                if (Math.abs(comboW - targetW) <= tolerance && 2 <= maxPanes) {
                    results.push({
                        totalWidth: comboW,
                        totalHeight: h,
                        widthDiff: comboW - targetW,
                        heightDiff: h - targetH,
                        panes: [c1, c2]
                    });
                }

                // 3 paños
                if (maxPanes >= 3) {
                    for (let k = j; k < candidates.length; k++) {
                        const c3 = candidates[k];
                        const reqQty = {};
                        [c1, c2, c3].forEach(c => reqQty[c.product.id] = (reqQty[c.product.id] || 0) + 1);

                        let stockOk = true;
                        Object.keys(reqQty).forEach(pid => {
                            const prod = inventory.find(p => p.id === pid);
                            if (prod && prod.unidades < reqQty[pid]) stockOk = false;
                        });

                        if (!stockOk) continue;

                        const combo3W = c1.width + c2.width + c3.width;
                        if (Math.abs(combo3W - targetW) <= tolerance) {
                            results.push({
                                totalWidth: combo3W,
                                totalHeight: h,
                                widthDiff: combo3W - targetW,
                                heightDiff: h - targetH,
                                panes: [c1, c2, c3]
                            });
                        }
                    }
                }
            }
        }
    });

    return results;
}

// Búsqueda de Dos Filas Verticales
function findTwoRowCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory) {
    const availableItems = inventory.filter(item => item.unidades > 0);
    const results = [];

    const eligibleWidths = new Set();
    availableItems.forEach(item => {
        if (Math.abs(item.ancho_cm - targetW) <= tolerance) eligibleWidths.add(item.ancho_cm);
        if (allowRotation && Math.abs(item.alto_cm - targetW) <= tolerance) eligibleWidths.add(item.alto_cm);
    });

    eligibleWidths.forEach(w => {
        const candidates = [];
        availableItems.forEach(item => {
            let matchesNormal = Math.abs(item.ancho_cm - w) < 0.01;
            let matchesRotated = allowRotation && Math.abs(item.alto_cm - w) < 0.01;

            if (matchesNormal) {
                candidates.push({
                    product: item,
                    rotated: false,
                    width: item.ancho_cm,
                    height: item.alto_cm
                });
            }
            if (matchesRotated && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
                candidates.push({
                    product: item,
                    rotated: true,
                    width: item.alto_cm,
                    height: item.ancho_cm
                });
            }
        });

        // Apilado de 2 paños verticales
        for (let i = 0; i < candidates.length; i++) {
            for (let j = i; j < candidates.length; j++) {
                const c1 = candidates[i];
                const c2 = candidates[j];

                if (c1.product.id === c2.product.id && c1.product.unidades < 2) continue;

                const comboH = c1.height + c2.height;
                if (Math.abs(comboH - targetH) <= tolerance && 2 <= maxPanes) {
                    results.push({
                        totalWidth: w,
                        totalHeight: comboH,
                        widthDiff: w - targetW,
                        heightDiff: comboH - targetH,
                        panes: [c1, c2]
                    });
                }
            }
        }
    });

    // Apilado de 2 filas con 2 columnas (4 paños en cuadrícula 2x2)
    if (maxPanes >= 4) {
        const uniqueHeights = new Set();
        availableItems.forEach(item => {
            uniqueHeights.add(item.alto_cm);
            if (allowRotation) uniqueHeights.add(item.ancho_cm);
        });

        uniqueHeights.forEach(h1 => {
            uniqueHeights.forEach(h2 => {
                if (Math.abs((h1 + h2) - targetH) <= tolerance) {
                    // Buscar candidatos para fila 1 y fila 2
                    const row1Combos = findRowCombinations(targetW, h1, 2, allowRotation, tolerance, inventory);
                    const row2Combos = findRowCombinations(targetW, h2, 2, allowRotation, tolerance, inventory);

                    if (row1Combos.length > 0 && row2Combos.length > 0) {
                        const r1 = row1Combos[0];
                        const r2 = row2Combos[0];
                        const panesList = [...r1.panes, ...r2.panes];

                        if (panesList.length <= maxPanes) {
                            results.push({
                                totalWidth: Math.max(r1.totalWidth, r2.totalWidth),
                                totalHeight: h1 + h2,
                                widthDiff: Math.max(r1.totalWidth, r2.totalWidth) - targetW,
                                heightDiff: (h1 + h2) - targetH,
                                panes: panesList
                            });
                        }
                    }
                }
            });
        });
    }

    return results;
}

// Búsqueda de cuadrícula R x C
function findGridCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory) {
    const availableItems = inventory.filter(item => item.unidades > 0);
    const results = [];

    availableItems.forEach(item => {
        checkGrid(item, item.ancho_cm, item.alto_cm, false);
        if (allowRotation && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
            checkGrid(item, item.alto_cm, item.ancho_cm, true);
        }
    });

    function checkGrid(item, w_p, h_p, rotated) {
        for (let r = 1; r <= 3; r++) {
            for (let c = 1; c <= 6; c++) {
                const totalPanes = r * c;
                if (totalPanes > maxPanes) continue;
                if (totalPanes > item.unidades) continue;

                const gridW = c * w_p;
                const gridH = r * h_p;

                if (Math.abs(gridW - targetW) <= tolerance && Math.abs(gridH - targetH) <= tolerance) {
                    const rowsStruct = [];
                    const paneObj = {
                        product: item,
                        rotated,
                        width: w_p,
                        height: h_p
                    };
                    const panesList = Array(totalPanes).fill(paneObj);

                    results.push({
                        type: 'grid',
                        rows: rowsStruct,
                        totalWidth: gridW,
                        totalHeight: gridH,
                        widthDiff: gridW - targetW,
                        heightDiff: gridH - targetH,
                        panes: panesList
                    });
                }
            }
        }
    }

    return results;
}

window.applyFallbackSetting = function(setting, value) {
    if (setting === 'tolerance') {
        const tSelect = document.getElementById('planner-tolerance');
        if (tSelect) tSelect.value = value;
    } else if (setting === 'panes') {
        const pSelect = document.getElementById('planner-panes');
        if (pSelect) pSelect.value = value;
    }
    const advOpts = document.getElementById('sizing-advanced-options');
    if (advOpts) {
        advOpts.style.display = 'block';
        advOpts.open = true;
    }
    const searchBtn = document.getElementById('sizing-search-btn');
    if (searchBtn) searchBtn.click();
};

// Renderizar propuestas en UI
function renderPlannerProposals(alternatives, targetW, targetH, container) {
    if (alternatives.length === 0) {
        container.innerHTML = `
            <div class="calc-no-results" style="text-align: left; padding: 24px; background: #fdfcf9; border: 1.5px solid #e2e8f0; border-radius: 16px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3 style="font-size: 1.15rem; margin: 0; color: var(--color-text-primary);">No encontramos combinaciones para ${targetW} × ${targetH} cm</h3>
                </div>
                <p style="font-size: 0.92rem; color: var(--color-text-muted); margin-bottom: 18px; line-height: 1.5;">
                    Te sugerimos probar estas opciones para encontrar alternativas en stock:
                </p>
                <div class="fallback-suggestions-grid" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                    <button onclick="applyFallbackSetting('tolerance', '10')" class="fallback-action-btn" style="text-align: left; padding: 12px 16px; border: 1.5px solid var(--color-olive); border-radius: 10px; background: #ffffff; color: var(--color-olive); font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
                        🔍 1. Aumentar la diferencia máxima permitida (a 10 cm o más)
                    </button>
                    <button onclick="applyFallbackSetting('panes', 'all')" class="fallback-action-btn" style="text-align: left; padding: 12px 16px; border: 1.5px solid var(--color-olive); border-radius: 10px; background: #ffffff; color: var(--color-olive); font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
                        🧩 2. Permitir más termopaneles por espacio
                    </button>
                    <button onclick="switchSizingMode('individual'); runUnifiedSearch(${targetW}, ${targetH});" class="fallback-action-btn" style="text-align: left; padding: 12px 16px; border: 1.5px solid var(--color-olive); border-radius: 10px; background: #ffffff; color: var(--color-olive); font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
                        📐 3. Probar medidas individuales cercanas en stock
                    </button>
                </div>
                <div style="padding-top: 15px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                    <span style="font-size: 0.88rem; color: var(--color-text-muted);">¿Prefieres que busquemos una alternativa manualmente?</span>
                    <button onclick="quotePlannerFallback(${targetW}, ${targetH})" class="calc-btn" style="background-color: var(--color-olive); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">
                        Consultar por WhatsApp
                    </button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    if (targetW < 160 && targetH < 220) {
        const note = document.createElement('div');
        note.className = 'planner-cross-ref-note';
        note.innerHTML = `<span>💡 <strong>¿Buscas un solo panel?</strong> Para espacios más pequeños, la <a onclick="scrollToSection('calculator-section', 'flash-calc')">Calculadora de Vano</a> te muestra las medidas individuales en stock más similares.</span>`;
        container.appendChild(note);
    }

    const grid = document.createElement('div');
    grid.className = 'planner-proposals-grid';

    alternatives.forEach((alt) => {
        const prop = alt.proposal;
        const card = document.createElement('div');
        card.className = 'proposal-card';

        const productCounts = {};
        prop.panes.forEach(pane => {
            const key = pane.product.id + (pane.rotated ? '_R' : '_N');
            if (!productCounts[key]) {
                productCounts[key] = {
                    product: pane.product,
                    rotated: pane.rotated,
                    qty: 0
                };
            }
            productCounts[key].qty++;
        });

        let panesDetailHtml = '';
        Object.values(productCounts).forEach(item => {
            const rotBadge = item.rotated ? '<span class="rotated-tag">Girado</span>' : '';
            panesDetailHtml += `
            <div class="proposal-pane-item">
                <span class="pane-qty">${item.qty}x</span>
                <span class="pane-dim">${item.product.ancho_cm} × ${item.product.alto_cm} cm</span>
                ${rotBadge}
            </div>
        `;
        });

        const wDiffSymbol = prop.widthDiff >= 0 ? '+' : '';
        const hDiffSymbol = prop.heightDiff >= 0 ? '+' : '';
        const wDiffRounded = (Math.round(Math.abs(prop.widthDiff) * 10) / 10).toString().replace('.', ',');
        const hDiffRounded = (Math.round(Math.abs(prop.heightDiff) * 10) / 10).toString().replace('.', ',');

        const wDiffText = Math.abs(prop.widthDiff) < 0.01 ? 'Exacto' : `${wDiffSymbol}${wDiffRounded} cm`;
        const hDiffText = Math.abs(prop.heightDiff) < 0.01 ? 'Exacto' : `${hDiffSymbol}${hDiffRounded} cm`;

        const svgVisual = generateProposalSVG(prop, targetW, targetH);

        const serializedProposal = encodeURIComponent(JSON.stringify(prop));

        card.innerHTML = `
        <div class="proposal-card-header">
            <span class="proposal-badge">${prop.unitCount === 1 ? '1 paño único' : `${prop.unitCount} paños combinados`}</span>
            <div class="proposal-price">$${prop.totalPrice.toLocaleString('es-CL')}</div>
        </div>
        
        <div class="proposal-visual-container">
            ${svgVisual}
        </div>
        
        <div class="proposal-dimensions-summary">
            <div class="dim-box">
                <span class="dim-label">Ancho Cubierto</span>
                <span class="dim-val">${prop.totalWidth.toFixed(1)} cm <small>(${wDiffText})</small></span>
            </div>
            <div class="dim-box">
                <span class="dim-label">Alto Cubierto</span>
                <span class="dim-val">${prop.totalHeight.toFixed(1)} cm <small>(${hDiffText})</small></span>
            </div>
        </div>

        <div class="proposal-panes-list">
            <div class="panes-list-title">Termopaneles utilizados:</div>
            ${panesDetailHtml}
        </div>
        
        <div class="proposal-actions" style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">
            <button class="cta-button" onclick="quoteProposalOnWhatsApp('${serializedProposal}')" style="margin: 0; padding: 12px 20px; font-size: 0.9rem; justify-content: center; width: 100%; background-color: var(--color-olive); color: white;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 448 512" style="margin-right: 6px;">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                </svg>
                Consultar disponibilidad por WhatsApp
            </button>
            <button class="cta-button secondary-btn" onclick="addProposalToCart('${serializedProposal}')" style="margin: 0; padding: 10px 16px; font-size: 0.85rem; justify-content: center; width: 100%;">
                🛒 Añadir los ${prop.unitCount} paños al Carro
            </button>
        </div>
    `;

        grid.appendChild(card);
    });

    container.appendChild(grid);
}

// Generador de Diagrama 2D SVG para propuestas de cobertura
function generateProposalSVG(prop, targetW, targetH) {
    const maxCanvasW = 320;
    const maxCanvasH = 180;
    const paddingX = 35;
    const paddingY = 25;

    const availableW = maxCanvasW - (paddingX * 2);
    const availableH = maxCanvasH - (paddingY * 2);

    const scaleX = availableW / Math.max(targetW, prop.totalWidth);
    const scaleY = availableH / Math.max(targetH, prop.totalHeight);
    const k_scale = Math.min(scaleX, scaleY);

    const outerW = targetW * k_scale;
    const outerH = targetH * k_scale;

    let svg = `<svg viewBox="0 0 ${maxCanvasW} ${maxCanvasH}" class="proposal-svg-diagram">`;

    // 1. Marco exterior representando el vano del cliente
    svg += `<rect x="${paddingX}" y="${paddingY}" width="${outerW}" height="${outerH}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3" rx="2" />`;

    // Cotas exteriores del vano
    svg += `<text x="${paddingX + (outerW / 2)}" y="${paddingY - 6}" font-size="9" font-weight="700" fill="#475569" text-anchor="middle">Ancho vano: ${targetW} cm</text>`;
    svg += `<text x="${paddingX - 6}" y="${paddingY + (outerH / 2)}" font-size="9" font-weight="700" fill="#475569" text-anchor="middle" transform="rotate(-90 ${paddingX - 6} ${paddingY + (outerH / 2)})">Alto vano: ${targetH} cm</text>`;

    // 2. Renderizar paños dentro del espacio
    let currentX = paddingX;
    let currentY = paddingY;

    if (prop.type === 'single') {
        const pane = prop.panes[0];
        const pW = pane.width * k_scale;
        const pH = pane.height * k_scale;

        svg += `<rect x="${paddingX}" y="${paddingY}" width="${pW}" height="${pH}" fill="url(#paneGrad)" stroke="#0284c7" stroke-width="1.5" rx="2" />`;
        svg += `<text x="${paddingX + (pW / 2)}" y="${paddingY + (pH / 2)}" font-size="10" font-weight="700" fill="#0369a1" text-anchor="middle" dominant-baseline="middle">${pane.product.ancho_cm}×${pane.product.alto_cm}</text>`;
    } else if (prop.type === 'row') {
        let posX = paddingX;
        prop.panes.forEach(pane => {
            const pW = pane.width * k_scale;
            const pH = pane.height * k_scale;

            svg += `<rect x="${posX}" y="${paddingY}" width="${pW}" height="${pH}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="2" opacity="0.9" />`;
            svg += `<text x="${posX + (pW / 2)}" y="${paddingY + (pH / 2)}" font-size="9" font-weight="700" fill="#0369a1" text-anchor="middle" dominant-baseline="middle">${pane.product.ancho_cm}×${pane.product.alto_cm}</text>`;

            posX += pW;
        });
    } else if (prop.type === 'two-rows') {
        let posX = paddingX;
        let posY = paddingY;

        prop.panes.forEach(pane => {
            const pW = pane.width * k_scale;
            const pH = pane.height * k_scale;

            if (posX + pW > paddingX + outerW + 1) {
                posX = paddingX;
                posY += pH;
            }

            svg += `<rect x="${posX}" y="${posY}" width="${pW}" height="${pH}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="2" opacity="0.9" />`;
            svg += `<text x="${posX + (pW / 2)}" y="${posY + (pH / 2)}" font-size="9" font-weight="700" fill="#0369a1" text-anchor="middle" dominant-baseline="middle">${pane.product.ancho_cm}×${pane.product.alto_cm}</text>`;

            posX += pW;
        });
    } else if (prop.type === 'grid') {
        let posX = paddingX;
        let posY = paddingY;

        prop.panes.forEach(pane => {
            const pW = pane.width * k_scale;
            const pH = pane.height * k_scale;

            if (posX + pW > paddingX + outerW + 0.5) {
                posX = paddingX;
                posY += pH;
            }

            svg += `<rect x="${posX}" y="${posY}" width="${pW}" height="${pH}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="2" opacity="0.9" />`;
            svg += `<text x="${posX + (pW / 2)}" y="${posY + (pH / 2)}" font-size="8" font-weight="700" fill="#0369a1" text-anchor="middle" dominant-baseline="middle">${pane.product.ancho_cm}×${pane.product.alto_cm}</text>`;

            posX += pW;
        });
    }

    // Indicador de holgura / espacio restante
    if (prop.totalWidth < targetW) {
        const remW = targetW - prop.totalWidth;
        const remW_pixel = remW * k_scale;
        const remX = paddingX + (prop.totalWidth * k_scale) + (remW_pixel / 2);
        const remY = paddingY + (outerH / 2);
        svg += `<text x="${remX}" y="${remY}" font-size="8" font-weight="700" fill="#64748b" text-anchor="middle" transform="rotate(-90 ${remX} ${remY})">Faltan ${remW.toFixed(1)} cm</text>`;
    }

    if (prop.totalHeight < targetH) {
        const remH = targetH - prop.totalHeight;
        const remH_pixel = remH * k_scale;
        const remX = paddingX + ((prop.totalWidth * k_scale) / 2);
        const remY = paddingY + (remH_pixel / 2);
        svg += `<text x="${remX}" y="${remY}" font-size="8" font-weight="700" fill="#64748b" text-anchor="middle">Faltan ${remH.toFixed(1)} cm de alto</text>`;
    }

    svg += `</svg>`;
    return svg;
}

// Agregar propuesta al carro de compras v2
window.addProposalToCart = function(serializedProposal) {
    try {
        const prop = JSON.parse(decodeURIComponent(serializedProposal));

        const productCounts = {};
        prop.panes.forEach(pane => {
            const key = pane.product.id;
            if (!productCounts[key]) {
                productCounts[key] = {
                    product: pane.product,
                    qty: 0
                };
            }
            productCounts[key].qty++;
        });

        let addedCount = 0;
        let errors = [];

        Object.values(productCounts).forEach(item => {
            const p = item.product;
            const cartItem = appState.cart.find(ci => ci.id === p.id);
            const currentQtyInCart = cartItem ? cartItem.qty : 0;

            if (currentQtyInCart + item.qty > p.unidades) {
                errors.push(`Medida ${p.medida_cm}: No hay suficiente stock (En carro: ${currentQtyInCart}, Solicitado: +${item.qty}, Disponible: ${p.unidades}).`);
            } else {
                if (cartItem) {
                    cartItem.qty += item.qty;
                } else {
                    appState.cart.push({
                        id: p.id,
                        ancho_cm: p.ancho_cm,
                        alto_cm: p.alto_cm,
                        medida_cm: p.medida_cm,
                        forma: p.forma,
                        qty: item.qty,
                        maxQty: p.unidades
                    });
                }
                addedCount += item.qty;
            }
        });

        if (errors.length > 0) {
            alert(`Algunas medidas no se pudieron agregar por límite de stock:\n\n${errors.join('\n')}\n\nSe agregaron las demás unidades exitosamente.`);
        } else {
            alert(`¡Se agregaron con éxito las ${addedCount} unidades de la propuesta al carro de compras!`);
        }

        saveCart();
        updateCartUI();
        openCart(true);
    } catch (e) {
        console.error('Error al agregar propuesta al carro:', e);
    }
};

// Cotizar propuesta en WhatsApp v2
window.quoteProposalOnWhatsApp = function(serializedProposal) {
    try {
        const prop = JSON.parse(decodeURIComponent(serializedProposal));

        const wInput = document.getElementById('sizing-width');
        const hInput = document.getElementById('sizing-height');
        const targetW = (wInput && wInput.value) ? wInput.value : (prop.totalWidth ? Math.round(prop.totalWidth) : '');
        const targetH = (hInput && hInput.value) ? hInput.value : (prop.totalHeight ? Math.round(prop.totalHeight) : '');

        const productCounts = {};
        prop.panes.forEach(pane => {
            const p = pane.product;
            const key = p.id || `${p.ancho_cm}x${p.alto_cm}`;
            if (!productCounts[key]) {
                productCounts[key] = {
                    product: p,
                    qty: 0
                };
            }
            productCounts[key].qty++;
        });

        const codeList = prop.panes.map(pane => pane.product.id ? pane.product.id : `${pane.product.ancho_cm}×${pane.product.alto_cm} cm`);
        let formattedCodes = '';
        if (codeList.length === 1) {
            formattedCodes = codeList[0];
        } else if (codeList.length === 2) {
            formattedCodes = `${codeList[0]} y ${codeList[1]}`;
        } else {
            const lastCode = codeList[codeList.length - 1];
            const leadingCodes = codeList.slice(0, codeList.length - 1).join(', ');
            formattedCodes = `${leadingCodes} y ${lastCode}`;
        }

        const medidasSummary = Object.values(productCounts).map(item => 
            `${item.product.ancho_cm} x ${item.product.alto_cm} cm (${item.qty} unidad${item.qty > 1 ? 'es' : ''})`
        ).join(', ');

        const totalPriceText = `$${prop.totalPrice.toLocaleString('es-CL')}`;
        const countText = prop.unitCount === 1 ? '1 termopanel' : `${prop.unitCount} termopaneles`;

        // Registrar cotización en Google Sheets
        recordQuoteToGoogleSheets({
            fecha: getChileDateTime(),
            medidas: medidasSummary,
            total: totalPriceText,
            vendido: 'Pendiente'
        });

        const message = `Hola, quiero cotizar ${countText} para mi proyecto.
Medida total del espacio: ${targetW} × ${targetH} cm.
Alternativa seleccionada: ${formattedCodes}.
Total estimado: ${totalPriceText}.
Quisiera confirmar disponibilidad y coordinar retiro en El Monte.`;

        const encodedText = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedText}`;
        window.open(whatsappUrl, '_blank');
    } catch (e) {
        console.error('Error al cotizar propuesta por WhatsApp:', e);
    }
};

window.quoteCustomClosing = function(widthVal, heightVal) {
    const medidasSummary = `Espacio vano ${widthVal} x ${heightVal} cm (Cierre especial)`;
    recordQuoteToGoogleSheets({
        fecha: getChileDateTime(),
        medidas: medidasSummary,
        total: 'Por cotizar',
        vendido: 'Pendiente'
    });

    const message = `Hola, quiero cotizar termopaneles para cubrir un espacio de ${widthVal} × ${heightVal} cm.
Quisiera consultar alternativas disponibles y coordinar retiro en El Monte.`;
    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
};

window.quotePlannerFallback = function(targetW, targetH) {
    const medidasSummary = `Espacio vano ${targetW} x ${targetH} cm (Consulta manual)`;
    recordQuoteToGoogleSheets({
        fecha: getChileDateTime(),
        medidas: medidasSummary,
        total: 'Por cotizar',
        vendido: 'Pendiente'
    });

    const message = `Hola, quiero cotizar opciones para cubrir un espacio de ${targetW} × ${targetH} cm.
Quisiera consultar combinaciones o alternativas en stock y coordinar retiro en El Monte.`;
    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
};

window.scrollToSection = function(id, flashClass) {
    if (id === 'calculator-section' || id === 'mode-individual') {
        if (window.switchSizingMode) window.switchSizingMode('individual');
        id = 'unified-sizing-section';
    } else if (id === 'planner-section' || id === 'mode-vano') {
        if (window.switchSizingMode) window.switchSizingMode('vano');
        id = 'unified-sizing-section';
    }
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        el.classList.remove('flash-element', 'flash-calc');
        void el.offsetWidth;
        el.classList.add(flashClass || 'flash-element');
        setTimeout(() => {
            el.classList.remove('flash-element', 'flash-calc');
        }, 4500);
    }
};

/* ------------------------------------------------------------------
   L'Oréal Routine Builder
   1. Browse products by category
   2. Click a card to select / unselect it (saved in localStorage)
   3. Generate a routine with OpenAI (through our Cloudflare Worker)
   4. Ask follow-up questions in the chat
------------------------------------------------------------------- */

/* ---------- Settings ---------- */

/* Paste YOUR Cloudflare Worker URL here.
   The Worker holds the OpenAI key, so NO API key goes in this file. */
const WORKER_URL = "https://loreal-routine.louisb28.workers.dev/";

/* The name we use to save selected products in the browser */
const STORAGE_KEY = "lorealSelectedProductIds";

/* ---------- DOM elements ---------- */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearAllBtn = document.getElementById("clearAll");
const generateBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

/* ---------- App state ---------- */
let allProducts = []; // every product from products.json
let selectedIds = []; // ids of the products the user picked
let isLoading = false; // true while we wait for the AI

/* The full conversation. OpenAI is stateless, so we send this whole
   array every time. That is how the AI "remembers" earlier messages. */
const messages = [
  {
    role: "system",
    content: `You are a friendly L'Oréal beauty advisor. You help people build
skincare, haircare, makeup, fragrance and grooming routines.
- When given a list of products (JSON), build a clear routine using ONLY those
  products. Split it into steps (for example Morning and Evening), say the order
  to use each product, and briefly explain why.
- Answer follow-up questions using the routine and the conversation so far.
- Only discuss the user's routine or beauty topics such as skincare, haircare,
  makeup, fragrance, suncare and grooming. If asked about anything else, politely
  say you can only help with beauty and routine questions.
- Write in plain text. Do not use markdown headings or tables. You may use
  numbered lists and **bold** for product names.`,
  },
];

/* ---------- Loading products ---------- */

/* Load product data from the JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* ---------- Showing products ---------- */

/* Create HTML for displaying product cards */
function displayProducts(products) {
  /* Show a friendly message if a category has no products */
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">No products found in this category</div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      /* Is this product already selected? (used for the highlight) */
      const isSelected = selectedIds.includes(product.id);

      return `
      <article class="product-card ${isSelected ? "selected" : ""}"
               data-id="${product.id}">

        <!-- Clicking this area selects or unselects the product -->
        <button type="button" class="select-area"
                aria-pressed="${isSelected}">
          <img src="${product.image}" alt="" />
          <h3>${product.name}</h3>
          <p class="brand">${product.brand}</p>
        </button>

        <!-- Separate button that shows or hides the description -->
        <button type="button" class="details-toggle" aria-expanded="false"
                aria-controls="desc-${product.id}">
          Details <i class="fa-solid fa-chevron-down"></i>
        </button>
        <p class="description" id="desc-${product.id}" hidden>
          ${product.description}
        </p>
      </article>
    `;
    })
    .join("");
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", () => {
  const selectedCategory = categoryFilter.value;

  /* filter() creates a new array containing only products
     where the category matches what the user selected */
  const filteredProducts = allProducts.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* One click listener for the whole grid ("event delegation").
   It works for cards that are added later, too. */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;

  /* Which button was clicked? */
  const selectArea = e.target.closest(".select-area");
  const detailsToggle = e.target.closest(".details-toggle");

  if (selectArea) {
    toggleProduct(Number(card.dataset.id));
  }

  if (detailsToggle) {
    /* Show or hide the description for this card only */
    const description = card.querySelector(".description");
    const isOpen = detailsToggle.getAttribute("aria-expanded") === "true";
    detailsToggle.setAttribute("aria-expanded", String(!isOpen));
    description.hidden = isOpen;
  }
});

/* ---------- Selecting products ---------- */

/* Add the product if it isn't selected, remove it if it is */
function toggleProduct(id) {
  if (selectedIds.includes(id)) {
    selectedIds = selectedIds.filter((selectedId) => selectedId !== id);
  } else {
    selectedIds.push(id);
  }
  updateSelection();
}

/* Remove one product (used by the × buttons in the list) */
function removeProduct(id) {
  selectedIds = selectedIds.filter((selectedId) => selectedId !== id);
  updateSelection();
}

/* Remove every product */
function clearAll() {
  selectedIds = [];
  updateSelection();
}

/* Save to localStorage, then refresh everything on screen */
function updateSelection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
  renderSelectedProducts();
  refreshCardHighlights();
}

/* Update the red border on cards that are visible in the grid.
   We change the cards in place so open descriptions stay open. */
function refreshCardHighlights() {
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    const isSelected = selectedIds.includes(Number(card.dataset.id));
    card.classList.toggle("selected", isSelected);
    card
      .querySelector(".select-area")
      .setAttribute("aria-pressed", String(isSelected));
  });
}

/* Build the "Selected Products" list */
function renderSelectedProducts() {
  /* Turn the saved ids back into full product objects */
  const selectedProducts = allProducts.filter((product) =>
    selectedIds.includes(product.id)
  );

  selectedCount.textContent = selectedProducts.length;
  clearAllBtn.hidden = selectedProducts.length === 0;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="empty-message">
        Nothing selected yet. Choose a category and click products to add them.
      </p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-item">
        <img src="${product.image}" alt="" />
        <span>${product.name}</span>
        <button type="button" data-remove-id="${product.id}"
                aria-label="Remove ${product.name}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `
    )
    .join("");
}

/* Listen for clicks on the × buttons */
selectedProductsList.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-id]");
  if (removeBtn) {
    removeProduct(Number(removeBtn.dataset.removeId));
  }
});

clearAllBtn.addEventListener("click", clearAll);

/* Read the saved ids from localStorage (or start empty) */
function loadSavedSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return [];
    /* Keep only ids that still exist in products.json */
    return saved.filter((id) => allProducts.some((p) => p.id === id));
  } catch (error) {
    return [];
  }
}

/* ---------- Chat ---------- */

/* Add a message bubble to the chat window.
   type is "user", "assistant", "error" or "loading" */
function addMessage(type, text) {
  /* Remove the starting hint the first time a message appears */
  const hint = chatWindow.querySelector(".chat-hint");
  if (hint) hint.remove();

  const bubble = document.createElement("div");
  bubble.className = `message ${type}`;

  /* Escape HTML so the text is safe, then turn **bold** into <strong> */
  const safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  bubble.innerHTML = safeText;

  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight; // scroll to newest
  return bubble;
}

/* Turn buttons on or off while we wait for the AI */
function setLoading(loading) {
  isLoading = loading;
  generateBtn.disabled = loading;
  sendBtn.disabled = loading;
}

/* Send the whole conversation to the Cloudflare Worker and show the reply */
async function sendToAI() {
  setLoading(true);
  const loadingBubble = addMessage("loading", "Thinking…");

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1", messages: messages }),
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;

    /* Save the reply so the AI remembers it next time */
    messages.push({ role: "assistant", content: reply });

    loadingBubble.remove();
    addMessage("assistant", reply);
  } catch (error) {
    console.error(error);

    /* The request failed, so take the user's last message back out of the
       history. Otherwise two user messages in a row would be sent next time. */
    messages.pop();

    loadingBubble.remove();
    addMessage(
      "error",
      "Sorry, something went wrong. Check your Worker URL in script.js and try again."
    );
  }

  setLoading(false);
}

/* "Generate Routine" button */
generateBtn.addEventListener("click", async () => {
  if (isLoading) return;

  /* Get only the selected products, and only the fields the AI needs */
  const productsForAI = allProducts
    .filter((product) => selectedIds.includes(product.id))
    .map((product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }));

  if (productsForAI.length === 0) {
    addMessage("error", "Select at least one product to generate a routine.");
    return;
  }

  const prompt = `Build a personalized routine using these products:\n${JSON.stringify(
    productsForAI,
    null,
    2
  )}`;

  /* Show a short message in the chat (not the whole JSON) */
  addMessage(
    "user",
    `Generate a routine with: ${productsForAI.map((p) => p.name).join(", ")}`
  );

  messages.push({ role: "user", content: prompt });
  await sendToAI();
});

/* Chat form submission: follow-up questions */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isLoading) return;

  const text = userInput.value.trim();
  if (text === "") return;

  addMessage("user", text);
  userInput.value = "";

  messages.push({ role: "user", content: text });
  await sendToAI();
});

/* ---------- Start the app ---------- */
async function init() {
  /* Show initial placeholder until user selects a category */
  productsContainer.innerHTML = `
    <div class="placeholder-message">
      Select a category to view products
    </div>
  `;

  /* Starting hint in the chat window */
  chatWindow.innerHTML = `
    <p class="chat-hint">
      Select products, then click Generate Routine. After that, ask me anything
      about your routine.
    </p>
  `;

  try {
    allProducts = await loadProducts();
  } catch (error) {
    console.error(error);
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Products couldn't load. Open the page from a local server
        (for example, VS Code Live Server) and refresh.
      </div>
    `;
  }

  /* Restore the products the user picked on their last visit */
  selectedIds = loadSavedSelection();
  renderSelectedProducts();
}

init();
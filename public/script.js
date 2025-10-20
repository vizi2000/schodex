/*
 * Client-side logic for the Hoszman staircase calculator.  This script
 * manages the chat conversation with the backend, handles image upload and
 * analysis, fills form fields with suggestions, calculates price, and
 * requests image generation.  The API endpoints are served by the Node.js
 * proxy in server.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Conversation state
  window.conversation = [];
  // Models used by the API.  You can adjust these values in one place.
  window.conversationModel = 'google/gemini-2.0-flash-exp:free';
  window.analysisModel = 'google/gemini-2.5-pro-preview';
  window.imageModel = 'google/gemini-2.5-flash-image-preview';

  // DOM references
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChat');
  const photoUpload = document.getElementById('photoUpload');
  const photoPreview = document.getElementById('photoPreview');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const analysisResult = document.getElementById('analysisResult');
  const generateBtn = document.getElementById('generateBtn');
  const visualizationImage = document.getElementById('visualizationImage');
  const calculateBtn = document.getElementById('calculateBtn');
  const priceResult = document.getElementById('priceResult');
  // Form fields
  const stairTypeEl = document.getElementById('stairType');
  const constructionEl = document.getElementById('construction');
  const woodTypeEl = document.getElementById('woodType');
  const finishEl = document.getElementById('finish');
  const heightEl = document.getElementById('height');
  const widthEl = document.getElementById('width');
  const stepCountEl = document.getElementById('stepCount');

  // Store uploaded image Data URL
  let uploadedImage = null;

  // Append a message to the chat area
  function appendMessage(role, text) {
    const msg = document.createElement('div');
    msg.className = `message ${role}`;
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Initialize the conversation with a greeting
  function initConversation() {
    const greeting = 'Cześć! Jestem wirtualnym doradcą. Powiedz mi, jakie schody planujesz i jakie są Twoje oczekiwania?';
    appendMessage('assistant', greeting);
    window.conversation.push({ role: 'assistant', content: greeting });
  }
  initConversation();

  // Handle sending a chat message
  async function sendChat() {
    const content = chatInput.value.trim();
    if (!content) return;
    appendMessage('user', content);
    window.conversation.push({ role: 'user', content });
    chatInput.value = '';
    // Call backend
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: window.conversation, model: window.conversationModel }),
      });
      const data = await response.json();
      if (data.reply) {
        appendMessage('assistant', data.reply);
        window.conversation.push({ role: 'assistant', content: data.reply });
      } else {
        appendMessage('assistant', 'Przepraszam, nie otrzymałem odpowiedzi z serwera.');
      }
    } catch (err) {
      console.error(err);
      appendMessage('assistant', 'Wystąpił błąd podczas kontaktu z serwerem. Spróbuj ponownie.');
    }
  }

  sendChatBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  });

  // Handle photo upload
  photoUpload.addEventListener('change', () => {
    const file = photoUpload.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      uploadedImage = ev.target.result;
      photoPreview.src = uploadedImage;
      photoPreview.style.display = 'block';
      analyzeBtn.disabled = false;
      generateBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  });

  // Handle analysis
  async function analyzePhoto() {
    if (!uploadedImage) return;
    analysisResult.textContent = 'Trwa analiza zdjęcia...';
    // Polish prompt instructing the model to analyze the raw stairs and propose parameters
    const prompt =
      'Na podstawie przesłanego zdjęcia surowych schodów oceń wymiary (wysokość, szerokość) i zaproponuj optymalny typ schodów, konstrukcję, gatunek drewna i wykończenie. Podaj liczbowo liczbę stopni, szerokość i wysokość kondygnacji. Uwzględnij średnie wartości jeśli nie można dokładnie określić. Odpowiedz po polsku.';
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: uploadedImage, prompt, model: window.analysisModel }),
      });
      const data = await response.json();
      if (data.analysis) {
        analysisResult.textContent = data.analysis;
        // Try to extract simple recommendations from the analysis (very naive)
        // This part can be extended with better NLP parsing. For now, we look for known keywords.
        const lower = data.analysis.toLowerCase();
        if (lower.includes('proste')) stairTypeEl.value = 'Proste';
        else if (lower.includes('jednozabiegowe')) stairTypeEl.value = 'Jednozabiegowe';
        else if (lower.includes('dwuzabiegowe')) stairTypeEl.value = 'Dwuzabiegowe';
        if (lower.includes('wpuszczane')) constructionEl.value = 'Wpuszczane';
        else if (lower.includes('nakładane')) constructionEl.value = 'Nakładane';
        else if (lower.includes('bolcowe')) constructionEl.value = 'Bolcowe';
        if (lower.includes('merbau')) woodTypeEl.value = 'Merbau';
        else if (lower.includes('dąb')) woodTypeEl.value = 'Dąb';
        else if (lower.includes('jesion')) woodTypeEl.value = 'Jesion';
        else if (lower.includes('buk')) woodTypeEl.value = 'Buk';
        // Extract numbers for height and width if present (cm)
        const numbers = data.analysis.match(/\d+/g);
        if (numbers) {
          // naive: first number -> height, second -> width, third -> steps
          if (numbers[0]) heightEl.value = numbers[0];
          if (numbers[1]) widthEl.value = numbers[1];
          if (numbers[2]) stepCountEl.value = numbers[2];
        }
      } else {
        analysisResult.textContent = 'Nie udało się uzyskać analizy.';
      }
    } catch (err) {
      console.error(err);
      analysisResult.textContent = 'Wystąpił błąd podczas analizy.';
    }
  }
  analyzeBtn.addEventListener('click', analyzePhoto);

  // Price calculation
  function calculatePrice() {
    const wood = woodTypeEl.value;
    const steps = parseInt(stepCountEl.value) || 0;
    // base prices per step (net) approximated from market data
    const stepPrices = {
      Buk: 70,
      Jesion: 100,
      'Dąb': 120,
      Merbau: 180,
      Sosna: 60,
      'Świerk': 50,
    };
    const finishCostPerStep = 50; // finishing per step
    const balusterCostPerStep = 50; // tralka cost per step
    const postCostPerStep = 14; // approximate cost: 140 PLN per 10 steps
    const railCostPerMeter = 60; // rail cost per meter
    const widthMeters = (parseInt(widthEl.value) || 0) / 100.0;
    const balustradeLength = steps * widthMeters;
    const stepCost = (stepPrices[wood] || 80) * steps;
    const finishCost = finishCostPerStep * steps;
    const balusterCost = balusterCostPerStep * steps;
    const postCost = postCostPerStep * steps;
    const railCost = railCostPerMeter * balustradeLength;
    const subtotal = stepCost + finishCost + balusterCost + postCost + railCost;
    const total = subtotal * 1.15; // 15% installation
    priceResult.innerHTML = `<strong>Przybliżony koszt netto:</strong> ${subtotal.toFixed(2)} PLN<br><strong>Przybliżony koszt brutto z montażem (15%):</strong> ${total.toFixed(2)} PLN`;
  }
  calculateBtn.addEventListener('click', calculatePrice);

  // Generate visualization
  async function generateVisualization() {
    if (!uploadedImage) return;
    // Compose prompt using selected parameters
    const prompt = `Stwórz realistyczną wizualizację schodów typu ${stairTypeEl.value} w konstrukcji ${constructionEl.value}, wykonanych z drewna ${woodTypeEl.value} i wykończonych metodą ${finishEl.value}. Schody powinny zostać naniesione na przesłane zdjęcie wnętrza, zachowując perspektywę i oświetlenie.`;
    visualizationImage.src = '';
    generateBtn.disabled = true;
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: uploadedImage, prompt, model: window.imageModel }),
      });
      const data = await response.json();
      if (data.image) {
        visualizationImage.src = data.image;
        visualizationImage.style.display = 'block';
      } else {
        alert('Nie udało się wygenerować wizualizacji.');
      }
    } catch (err) {
      console.error(err);
      alert('Wystąpił błąd podczas generowania wizualizacji.');
    } finally {
      generateBtn.disabled = false;
    }
  }
  generateBtn.addEventListener('click', generateVisualization);
});
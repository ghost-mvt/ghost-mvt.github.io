(function() {
    const PROMPT_RAW_URL = "https://raw.githubusercontent.com/ghost-mvt/XUZ/main/ai/memory.md";
    let fetchedSystemPrompt = "Default system prompt fallback.";

    const ENCRYPTED_API_KEYS = [
        "IjoDEh0SDF9SXRk/Xk1UDFUAGh8eDUZVVwcYHg==",
        "IjoDEh1bSUpQVBk/Xk1TGxUAHBweChxQBgMZHA==",
        "IjoDEh1BWh1aXFk/Xk0bGFUHHBsaBAJWUggXFA==",
        "IjoDEhlURVJAUxk/Xk0FGxsYDR0cBhxRBgcFGQ==",
        "IjoDEhhBSRpSRhk/Xk1eGxsaGRsdBAVaAAcYFQ==",
        "IjoDEhIHF1pCShk/Xk1dGw0eHwIeAF5VAQAdBA==",
        "IjoDEh5VU1pXSRk/Xk1TBhwbHxgCGAVVAwcbBA=="
    ];

    const MODELS_API = "https://router.huggingface.co/v1/models";

    let currentTokenIndex = -1;
    let availableModels = []; 
    let conversationHistory = []; 

    let synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();

    function getActiveToken(index) {
        if (typeof window.getDecryptedKey === "function") {
            return window.getDecryptedKey(ENCRYPTED_API_KEYS[index]);
        }
        const LAB_KEY = "CyberLabSecretKey_2026_SecureVault";
        try {
            const rawText = atob(ENCRYPTED_API_KEYS[index]);
            let res = "";
            for (let i = 0; i < rawText.length; i++) {
                res += String.fromCharCode(rawText.charCodeAt(i) ^ LAB_KEY.charCodeAt(i % LAB_KEY.length));
            }
            return res;
        } catch (e) {
            return "";
        }
    }

    window.updateTokenDisplay = function() {
        const tokenEl = document.getElementById("currentTokenValue");
        if (tokenEl && currentTokenIndex !== -1) {
            tokenEl.innerText = getActiveToken(currentTokenIndex);
        }
    };

    function getRandomKeyIndex(excludedIndices = []) {
        const available = ENCRYPTED_API_KEYS.map((_, i) => i).filter(i => !excludedIndices.includes(i));
        if (available.length === 0) return -1;
        return available[Math.floor(Math.random() * available.length)];
    }

    async function fetchGithubPrompt() {
        try {
            const res = await fetch(PROMPT_RAW_URL);
            if (res.ok) {
                fetchedSystemPrompt = await res.text();
            }
        } catch (err) {
            console.error("Error fetching prompt:", err);
        }
    }

    function loadSavedModel() {
        const savedModel = localStorage.getItem("selectedModel");
        const searchInput = document.getElementById("modelSearch");
        const selectedModelValue = document.getElementById("selectedModelValue");

        if (savedModel) {
            searchInput.value = savedModel;
            selectedModelValue.value = savedModel;
        } else {
            selectedModelValue.value = searchInput.value;
        }
    }

    function saveModel(modelName) {
        if (modelName) {
            localStorage.setItem("selectedModel", modelName);
        }
    }

    async function fetchModels(triedIndices = []) {
        const searchInput = document.getElementById("modelSearch");
        const sendBtn = document.getElementById("sendBtn");
        const output = document.getElementById("explanationOutput");

        const keyIndex = getRandomKeyIndex(triedIndices);
        if (keyIndex === -1) {
            searchInput.placeholder = "Search models...";
            sendBtn.disabled = false;
            return;
        }

        currentTokenIndex = keyIndex;
        updateTokenDisplay();

        try {
            const activeKey = getActiveToken(keyIndex);
            const res = await fetch(MODELS_API, {
                method: "GET",
                headers: { "Authorization": `Bearer ${activeKey}` }
            });
            
            if (!res.ok) return await fetchModels([...triedIndices, keyIndex]);

            const data = await res.json();
            if (data.data && Array.isArray(data.data)) {
                availableModels = data.data.map(m => m.id);
                searchInput.placeholder = "Search models...";
                sendBtn.disabled = false;
            }
        } catch (err) {
            if (triedIndices.length < ENCRYPTED_API_KEYS.length - 1) {
                return await fetchModels([...triedIndices, keyIndex]);
            }
            sendBtn.disabled = false;
        }
    }

    window.copyText = function(event, elementId) {
        event.preventDefault();
        const content = document.getElementById(elementId).innerText;
        if (!content) return;

        const btn = event.target;
        navigator.clipboard.writeText(content).then(() => {
            const orig = btn.innerText;
            btn.innerText = "Copied!";
            setTimeout(() => btn.innerText = orig, 1500);
        });
    };

    window.speakResponse = function(event, elementId) {
        event.preventDefault();
        const btn = event.target;
        const content = document.getElementById(elementId).innerText;

        if (synth.speaking) {
            synth.cancel();
            btn.innerText = "Speak";
            return;
        }
        if (!content) return;

        utterance = new SpeechSynthesisUtterance(content);
        utterance.onend = () => btn.innerText = "Speak";
        btn.innerText = "Stop";
        synth.speak(utterance);
    };

    function extractCode(rawText) {
        const markdownRegex = /```(?:[a-zA-Z0-9_+-]*\n)?([\s\S]*?)```/g;
        const matches = [...rawText.matchAll(markdownRegex)].map(m => m[1].trim());
        return matches.length > 0 ? matches.join("\n\n// --- NEXT CODE BLOCK ---\n\n") : "";
    }

    async function executeApiFetch(selectedModel, messages, triedIndices = []) {
        const keyIndex = getRandomKeyIndex(triedIndices);
        if (keyIndex === -1) throw new Error("All API keys failed or network blocked.");

        currentTokenIndex = keyIndex;
        updateTokenDisplay();

        const activeKey = getActiveToken(keyIndex);
        const MODEL_URL = `https://api-inference.huggingface.co/models/${selectedModel}/v1/chat/completions`;

        try {
            const response = await fetch(MODEL_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${activeKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 1024
                })
            });

            if (!response.ok) {
                return await executeApiFetch(selectedModel, messages, [...triedIndices, keyIndex]);
            }

            const data = await response.json();
            return { response, data };
        } catch (err) {
            if (triedIndices.length < ENCRYPTED_API_KEYS.length - 1) {
                return await executeApiFetch(selectedModel, messages, [...triedIndices, keyIndex]);
            }
            throw new Error("Network Error: Failed to fetch. Verify API key permissions or CORS.");
        }
    }

    window.sendRouterRequest = async function() {
        const selectedModel = document.getElementById("selectedModelValue").value;
        const promptText = document.getElementById("promptText").value;
        const explanationOutput = document.getElementById("explanationOutput");
        const codeContainer = document.getElementById("embeddedCodeContainer");
        const codeOutput = document.getElementById("embeddedCodeOutput");
        const sendBtn = document.getElementById("sendBtn");

        if (!selectedModel.trim() || !promptText.trim()) {
            alert("Please select a model and enter text.");
            return;
        }

        if (!fetchedSystemPrompt) {
            await fetchGithubPrompt();
        }

        sendBtn.disabled = true;
        explanationOutput.className = "output-box";
        explanationOutput.innerText = "Processing request...";
        codeContainer.style.display = "none";

        if (conversationHistory.length === 0) {
            conversationHistory.push({ role: "system", content: fetchedSystemPrompt });
        }
        conversationHistory.push({ role: "user", content: promptText });

        try {
            const { data } = await executeApiFetch(selectedModel, conversationHistory);
            const aiMessage = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "No response content received.";

            conversationHistory.push({ role: "assistant", content: aiMessage });

            explanationOutput.innerText = aiMessage;

            const extractedCode = extractCode(aiMessage);
            if (extractedCode) {
                codeOutput.innerText = extractedCode;
                codeContainer.style.display = "block";
            }
        } catch (err) {
            explanationOutput.className = "output-box error";
            explanationOutput.innerText = err.message;
        } finally {
            sendBtn.disabled = false;
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        loadSavedModel();
        currentTokenIndex = getRandomKeyIndex();
        updateTokenDisplay();
        fetchGithubPrompt();
        fetchModels();

        const modelSearch = document.getElementById("modelSearch");
        const modelDropdown = document.getElementById("modelDropdown");
        const selectedModelValue = document.getElementById("selectedModelValue");

        if (modelSearch) {
            modelSearch.addEventListener("input", () => {
                const term = modelSearch.value.toLowerCase();
                selectedModelValue.value = modelSearch.value;
                saveModel(modelSearch.value);

                if (!term.trim()) { modelDropdown.classList.remove("active"); return; }

                const filtered = availableModels.filter(m => m.toLowerCase().includes(term));
                modelDropdown.innerHTML = "";
                
                filtered.forEach(m => {
                    const item = document.createElement("div");
                    item.className = "dropdown-item";
                    item.innerText = m;
                    item.onclick = () => {
                        modelSearch.value = m;
                        selectedModelValue.value = m;
                        saveModel(m);
                        modelDropdown.classList.remove("active");
                    };
                    modelDropdown.appendChild(item);
                });
                modelDropdown.classList.add("active");
            });
        }

        document.addEventListener("click", (e) => {
            if (modelSearch && modelDropdown && !modelSearch.contains(e.target) && !modelDropdown.contains(e.target)) {
                modelDropdown.classList.remove("active");
            }
        });
    });
})();

(function() {
    const PROMPT_RAW_URL = "https://raw.githubusercontent.com/ghost-mvt/XUZ/main/ai/memory.md";
    let fetchedSystemPrompt = "You are a helpful AI assistant. Provide clear and concise answers.";

    const DEFAULT_MODELS = [
        "meta-llama/Llama-3.1-8B-Instruct",
        "mistralai/Mistral-7B-Instruct-v0.1",
        "NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO",
        "gpt2",
        "facebook/opt-350m"
    ];

    let currentTokenIndex = -1;
    let availableModels = DEFAULT_MODELS; 
    let conversationHistory = []; 

    let synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();

    function getActiveToken() {
        const userApiKey = document.getElementById("apiKeyInput")?.value?.trim();
        
        if (userApiKey) {
            return userApiKey;
        }

        // Fallback: return empty (will require user to provide their own key)
        return "";
    }

    window.updateTokenDisplay = function() {
        const tokenEl = document.getElementById("currentTokenValue");
        const userApiKey = document.getElementById("apiKeyInput")?.value?.trim();
        
        if (tokenEl) {
            if (userApiKey) {
                tokenEl.innerText = "✓ Using custom API key";
            } else {
                tokenEl.innerText = "⚠ No API key provided";
            }
        }
    };

    async function fetchGithubPrompt() {
        try {
            const res = await fetch(PROMPT_RAW_URL);
            if (res.ok) {
                fetchedSystemPrompt = await res.text();
            }
        } catch (err) {
            console.warn("Could not fetch prompt from GitHub, using default.");
            fetchedSystemPrompt = "You are a helpful AI assistant. Provide clear and concise answers.";
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

    function loadSavedApiKey() {
        const savedKey = localStorage.getItem("huggingFaceApiKey");
        const apiKeyInput = document.getElementById("apiKeyInput");
        if (savedKey && apiKeyInput) {
            apiKeyInput.value = savedKey;
        }
    }

    function saveModel(modelName) {
        if (modelName) {
            localStorage.setItem("selectedModel", modelName);
        }
    }

    function saveApiKey(apiKey) {
        if (apiKey) {
            localStorage.setItem("huggingFaceApiKey", apiKey);
        }
    }

    async function fetchModels() {
        const searchInput = document.getElementById("modelSearch");
        const sendBtn = document.getElementById("sendBtn");
        const userApiKey = document.getElementById("apiKeyInput")?.value?.trim();

        // Try to fetch real models if user provided an API key
        if (userApiKey) {
            try {
                const res = await fetch("https://huggingface.co/api/models", {
                    headers: { "Authorization": `Bearer ${userApiKey}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        availableModels = data.slice(0, 50).map(m => m.id);
                        searchInput.placeholder = "Search models...";
                        sendBtn.disabled = false;
                        return;
                    }
                }
            } catch (err) {
                console.warn("Could not fetch models, using defaults");
            }
        }

        // Use default models
        availableModels = DEFAULT_MODELS;
        searchInput.placeholder = "Search models (defaults)...";
        sendBtn.disabled = false;
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
        }).catch(() => {
            alert("Could not copy to clipboard");
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

    async function executeApiFetch(selectedModel, messages) {
        const userApiKey = getActiveToken();
        
        if (!userApiKey) {
            throw new Error("❌ No API Key Provided!\n\n1. Get a free Hugging Face API key at:\n   https://huggingface.co/settings/tokens\n\n2. Enter it in the 'API Key' field above\n\n3. Try again!");
        }

        const MODEL_URL = `https://api-inference.huggingface.co/models/${selectedModel}/v1/chat/completions`;
        
        try {
            const response = await fetch(MODEL_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${userApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 1024
                })
            });

            if (response.status === 401 || response.status === 403) {
                throw new Error("❌ Invalid API Key!\n\nYour Hugging Face token is incorrect or expired.\n\nGet a new one at:\nhttps://huggingface.co/settings/tokens");
            }

            if (response.status === 429) {
                throw new Error("⏱ Rate Limited!\n\nYou've made too many requests. Please wait a moment and try again.\n\n(Free tier has usage limits)");
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`❌ API Error (${response.status}):\n${errorText.substring(0, 200)}`);
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0]?.message?.content) {
                throw new Error("❌ Invalid response from API. Please try again.");
            }

            return { response, data };
        } catch (err) {
            if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
                throw new Error("❌ Network Error / CORS Issue\n\nMake sure:\n1. Your API key is correct\n2. You have an active internet connection\n3. The Hugging Face API is accessible");
            }
            throw err;
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
            alert("Please enter a model and prompt text.");
            return;
        }

        sendBtn.disabled = true;
        explanationOutput.className = "output-box";
        explanationOutput.innerText = "⏳ Processing...";
        codeContainer.style.display = "none";

        if (!fetchedSystemPrompt || fetchedSystemPrompt === "You are a helpful AI assistant. Provide clear and concise answers.") {
            await fetchGithubPrompt();
        }

        if (conversationHistory.length === 0) {
            conversationHistory.push({ role: "system", content: fetchedSystemPrompt });
        }
        conversationHistory.push({ role: "user", content: promptText });

        try {
            const { data } = await executeApiFetch(selectedModel, conversationHistory);
            const aiMessage = data.choices[0].message.content;

            conversationHistory.push({ role: "assistant", content: aiMessage });

            explanationOutput.className = "output-box";
            explanationOutput.innerText = aiMessage;

            const extractedCode = extractCode(aiMessage);
            if (extractedCode) {
                codeOutput.innerText = extractedCode;
                codeContainer.style.display = "block";
            }

            // Save API key
            const apiKeyInput = document.getElementById("apiKeyInput");
            if (apiKeyInput?.value) {
                saveApiKey(apiKeyInput.value.trim());
            }
        } catch (err) {
            explanationOutput.className = "output-box error";
            explanationOutput.innerText = err.message || "Unknown error. Please try again.";
            console.error("Error:", err);
        } finally {
            sendBtn.disabled = false;
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        loadSavedModel();
        loadSavedApiKey();
        fetchGithubPrompt();
        fetchModels();
        updateTokenDisplay();

        const apiKeyInput = document.getElementById("apiKeyInput");
        if (apiKeyInput) {
            apiKeyInput.addEventListener("change", () => {
                saveApiKey(apiKeyInput.value.trim());
                fetchModels();
                updateTokenDisplay();
            });
            apiKeyInput.addEventListener("input", updateTokenDisplay);
        }

        const modelSearch = document.getElementById("modelSearch");
        const modelDropdown = document.getElementById("modelDropdown");
        const selectedModelValue = document.getElementById("selectedModelValue");

        if (modelSearch) {
            modelSearch.addEventListener("input", () => {
                const term = modelSearch.value.toLowerCase();
                selectedModelValue.value = modelSearch.value;
                saveModel(modelSearch.value);

                if (!term.trim()) { 
                    modelDropdown.classList.remove("active"); 
                    return; 
                }

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
            if (modelSearch && modelDropdown && 
                !modelSearch.contains(e.target) && 
                !modelDropdown.contains(e.target)) {
                modelDropdown.classList.remove("active");
            }
        });
    });
})();

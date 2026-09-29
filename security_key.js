const LAB_KEY = "CyberLabSecretKey_2026_SecureVault";

function decryptToken(cipherText, key = LAB_KEY) {
    try {
        const rawText = atob(cipherText);
        let result = "";
        for (let i = 0; i < rawText.length; i++) {
            result += String.fromCharCode(rawText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    } catch (e) {
        return "";
    }
}

window.getDecryptedKey = function(encryptedBase64) {
    return decryptToken(encryptedBase64, LAB_KEY);
};

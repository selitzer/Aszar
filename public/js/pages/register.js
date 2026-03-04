const msgEl = document.getElementById("msg");

const userInput = document.getElementById("regUsername");
const emailInput = document.getElementById("regEmail");
const pwInput = document.getElementById("regPassword");

const pwField = pwInput.closest(".field");
const formError = document.getElementById("formError");

const spinnerWrap = document.getElementById("spinnerWrap");
const submitBtn = document.querySelector("#registerForm button[type='submit']");

function clearError() {
  msgEl.textContent = "";
  pwField.classList.remove("has-error");
  formError.querySelector(".error-message").textContent = "";
}

function showError(message) {
  msgEl.textContent = "";
  pwField.classList.add("has-error");
  formError.querySelector(".error-message").textContent = message;
}

function setLoading(isLoading) {
  spinnerWrap.style.display = isLoading ? "flex" : "none";
  submitBtn.disabled = isLoading;
  submitBtn.style.opacity = isLoading ? "0.85" : "1";
  msgEl.textContent = "";
}
document
  .getElementById("registerForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const username = userInput.value.trim();
    const email = emailInput.value.trim();
    const password = pwInput.value;

    if (!username) {
      showError("Please enter a username.");
      return;
    }
    if (!email) {
      showError("Please enter an email.");
      return;
    }
    if (!password) {
      showError("Please enter a password.");
      return;
    }

    setLoading(true);
    try {
      await registerApi(username, email, password);
      window.location.href = "/dashboard";
    } catch (err) {
      setLoading(false);
      showError(err.message || "Registration failed.");
    }
  });

[userInput, emailInput, pwInput].forEach((el) => {
  el.addEventListener("input", clearError);
});

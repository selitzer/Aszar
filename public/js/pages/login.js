const msgEl = document.getElementById("msg");

const idInput = document.getElementById("loginIdentifier");
const pwInput = document.getElementById("loginPassword");

const pwField = pwInput.closest(".field");
const formError = document.getElementById("formError");

const spinnerWrap = document.getElementById("spinnerWrap");
const submitBtn = document.querySelector("#loginForm button[type='submit']");

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
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const identifier = idInput.value.trim();
  const password = pwInput.value;

  if (!identifier) {
    showError("Please enter a username or email.");
    return;
  }

  if (!password) {
    showError("Please enter your password.");
    return;
  }

  setLoading(true);

  try {
    await loginApi(identifier, password);
    window.location.href = "/dashboard";
  } catch {
    setLoading(false);
    showError("Invalid credentials.");
  }
});

idInput.addEventListener("input", clearError);
pwInput.addEventListener("input", clearError);

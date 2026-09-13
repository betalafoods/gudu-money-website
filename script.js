(function () {
  "use strict";

  var rupeeFormatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  });

  function formatRupees(n) {
    return "₹" + rupeeFormatter.format(Math.round(n));
  }

  // ===== Mobile nav toggle =====
  var header = document.querySelector(".site-header");
  var navToggle = document.getElementById("navToggle");

  if (navToggle && header) {
    navToggle.addEventListener("click", function () {
      header.classList.toggle("nav-open");
    });

    document.querySelectorAll(".nav a").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("nav-open");
      });
    });
  }

  // ===== EMI Calculator =====
  var loanAmountInput = document.getElementById("loanAmount");
  var tenureInput = document.getElementById("tenure");
  var interestRateInput = document.getElementById("interestRate");

  var loanAmountValue = document.getElementById("loanAmountValue");
  var tenureValue = document.getElementById("tenureValue");
  var interestRateValue = document.getElementById("interestRateValue");

  var emiOutput = document.getElementById("emiOutput");
  var principalOutput = document.getElementById("principalOutput");
  var interestOutput = document.getElementById("interestOutput");
  var totalOutput = document.getElementById("totalOutput");
  var barPrincipal = document.getElementById("barPrincipal");
  var barInterest = document.getElementById("barInterest");

  function calculateEMI() {
    var principal = parseFloat(loanAmountInput.value);
    var months = parseInt(tenureInput.value, 10);
    var annualRate = parseFloat(interestRateInput.value);
    var monthlyRate = annualRate / 12 / 100;

    var emi;
    if (monthlyRate === 0) {
      emi = principal / months;
    } else {
      var factor = Math.pow(1 + monthlyRate, months);
      emi = (principal * monthlyRate * factor) / (factor - 1);
    }

    var totalPayment = emi * months;
    var totalInterest = totalPayment - principal;

    loanAmountValue.textContent = rupeeFormatter.format(principal);
    tenureValue.textContent = months;
    interestRateValue.textContent = annualRate.toFixed(1);

    emiOutput.textContent = formatRupees(emi);
    principalOutput.textContent = formatRupees(principal);
    interestOutput.textContent = formatRupees(totalInterest);
    totalOutput.textContent = formatRupees(totalPayment);

    var principalPct = (principal / totalPayment) * 100;
    var interestPct = 100 - principalPct;
    barPrincipal.style.width = principalPct + "%";
    barInterest.style.width = interestPct + "%";
  }

  [loanAmountInput, tenureInput, interestRateInput].forEach(function (input) {
    if (input) input.addEventListener("input", calculateEMI);
  });

  if (loanAmountInput) calculateEMI();
})();

/**
 * Core payroll calculation engine.
 *
 * This module is deliberately pure (no DOM, no network) so it can be tested and audited
 * on its own. All money amounts are plain numbers (USD).
 *
 * PRINCIPLES CARRIED OVER FROM THE ORIGINAL "WAGES TEMPLATE" WORKBOOK:
 *  - Daily rate for NEC-based categories = NEC Monthly Rate / WorkingDaysPerMonth (26)
 *  - "Incentive Bonus" tops workers up from the NEC minimum to the (higher) SPE rate:
 *      (SPEMonthlyRate/26 - NECMonthlyRate/26) * total days worked
 *  - Overtime hourly rate = NEC Monthly Rate / HoursPerMonth (234)
 *  - Overtime tiers multiply that hourly rate by 1.0 (x1.5 tier, matching the template's
 *    existing behaviour, kept as-is per instruction), 2.0, and 2.5
 *  - NSSA and NEC subscription deductions are calculated on Total Basic Pay only
 *    (not on incentive or overtime), matching the template
 *  - NSSA is capped at an insurable earnings ceiling (default $700/month, gazetted
 *    quarterly by NSSA - check this periodically)
 *
 * ADDED (not present in the original template, per your request):
 *  - PAYE (Zimbabwe income tax) computed on Gross Taxable Pay using ZIMRA's band table,
 *    plus the 3% AIDS levy on the tax payable
 *  - A net-to-gross "gross-up" solver
 */

/**
 * @typedef PayCategory
 * @property {string} CategoryKey
 * @property {string} Label
 * @property {string} Unit - 'days' | 'kg' | 'pockets' | 'hours' | 'amount'
 * @property {string} RateType - 'nec_daily' | 'spe_daily' | 'fixed_rate' | 'direct_amount' | 'overtime_tier'
 * @property {number} FixedRate
 */

/**
 * Compute one employee's full pay breakdown for a period.
 *
 * @param {object} employee - {EmployeeID, Name, PayrollGroup, SPEMonthlyRate, NECMonthlyRate}
 * @param {Object.<string, number>} quantities - map of CategoryKey -> quantity entered for this period
 * @param {PayCategory[]} categories
 * @param {object} settings - {WorkingDaysPerMonth, HoursPerMonth, NSSA_EmployeeRate, NSSA_Ceiling, NEC_DefaultRate, AidsLevyRate}
 * @param {{Lower:number,Upper:number,Rate:number,Deduct:number}[]} payeBands
 * @param {number} otherDeductionsTotal - sum of ad-hoc deductions (mealie meal, loans, GAPWUZ, etc.)
 * @returns {object} full breakdown
 */
function computePayroll(employee, quantities, categories, settings, payeBands, otherDeductionsTotal) {
  var workingDays = num_(settings.WorkingDaysPerMonth, 26);
  var hoursPerMonth = num_(settings.HoursPerMonth, 234);
  var necDailyRate = num_(employee.NECMonthlyRate, 0) / workingDays;
  var speDailyRate = num_(employee.SPEMonthlyRate, 0) / workingDays;
  var necHourlyRate = num_(employee.NECMonthlyRate, 0) / hoursPerMonth;

  var totalDays = 0;
  var totalBasicPay = 0;
  var overtimeAmount = 0;
  var directAmounts = 0;
  var categoryBreakdown = [];

  categories.forEach(function (cat) {
    var qty = num_(quantities[cat.CategoryKey], 0);
    if (qty === 0) return;

    var rate = 0;
    var amount = 0;

    if (cat.RateType === 'nec_daily') {
      rate = necDailyRate;
      amount = qty * rate;
      totalDays += qty;
      totalBasicPay += amount;
    } else if (cat.RateType === 'spe_daily') {
      rate = speDailyRate;
      amount = qty * rate;
      totalDays += qty;
      totalBasicPay += amount;
    } else if (cat.RateType === 'fixed_rate') {
      rate = num_(cat.FixedRate, 0);
      amount = qty * rate;
      if (cat.Unit === 'days') totalDays += qty;
      totalBasicPay += amount;
    } else if (cat.RateType === 'direct_amount') {
      amount = qty; // quantity IS the dollar amount
      directAmounts += amount;
    } else if (cat.RateType === 'overtime_tier') {
      var multiplier = num_(cat.FixedRate, 1);
      rate = necHourlyRate * multiplier;
      amount = qty * rate;
      overtimeAmount += amount;
    }

    categoryBreakdown.push({
      key: cat.CategoryKey, label: cat.Label, quantity: qty, rate: rate, amount: round2_(amount)
    });
  });

  var incentiveBonus = (speDailyRate - necDailyRate) * totalDays;
  if (incentiveBonus < 0) incentiveBonus = 0; // SPE rate should never be below NEC minimum

  var grossTaxablePay = totalBasicPay + incentiveBonus + overtimeAmount + directAmounts;

  var nssaBase = Math.min(totalBasicPay, num_(settings.NSSA_Ceiling, 700));
  var nssa = nssaBase * num_(settings.NSSA_EmployeeRate, 0.045);
  var nec = totalBasicPay * num_(settings.NEC_DefaultRate, 0.015);

  var paye = computePAYE(grossTaxablePay, payeBands, num_(settings.AidsLevyRate, 0.03));

  var netPay = grossTaxablePay - nssa - nec - paye - num_(otherDeductionsTotal, 0);

  return {
    employeeId: employee.EmployeeID,
    name: employee.Name,
    payrollGroup: employee.PayrollGroup,
    categoryBreakdown: categoryBreakdown,
    totalDays: round2_(totalDays),
    totalBasicPay: round2_(totalBasicPay),
    incentiveBonus: round2_(incentiveBonus),
    overtimeAmount: round2_(overtimeAmount),
    directAmounts: round2_(directAmounts),
    grossTaxablePay: round2_(grossTaxablePay),
    paye: round2_(paye),
    nssa: round2_(nssa),
    nec: round2_(nec),
    otherDeductions: round2_(num_(otherDeductionsTotal, 0)),
    netPay: round2_(netPay)
  };
}

/**
 * ZIMRA monthly PAYE using the band + deduct-constant method:
 *   tax = income * band.Rate - band.Deduct   (for the band the income falls in)
 * then AIDS levy = tax * aidsLevyRate, total PAYE = tax + AIDS levy.
 */
function computePAYE(monthlyTaxableIncome, payeBands, aidsLevyRate) {
  if (monthlyTaxableIncome <= 0) return 0;
  var band = payeBands.filter(function (b) {
    return monthlyTaxableIncome >= num_(b.Lower, 0) && monthlyTaxableIncome <= num_(b.Upper, Infinity);
  })[0];
  if (!band) {
    // above the top band's Upper (shouldn't happen if top band uses a huge Upper) - use top band
    band = payeBands[payeBands.length - 1];
  }
  var tax = monthlyTaxableIncome * num_(band.Rate, 0) - num_(band.Deduct, 0);
  if (tax < 0) tax = 0;
  var aidsLevy = tax * num_(aidsLevyRate, 0.03);
  return tax + aidsLevy;
}

/**
 * Net-to-gross "gross-up" solver.
 *
 * You know: the fixed non-basic earnings for the period (incentive + overtime + direct
 * amounts, computed the normal way from entered days/hours), and the fixed other
 * deductions (loans, mealie meal, etc). You want to find the "Total Basic Pay" (B) such
 * that the resulting Net Pay equals a target amount.
 *
 * Net(B) = (B + fixedOtherEarnings)
 *          - NSSA(min(B, ceiling) * nssaRate)
 *          - NEC(B * necRate)
 *          - PAYE(B + fixedOtherEarnings)
 *          - fixedOtherDeductions
 *
 * Net(B) is monotonically increasing in B for any realistic rate structure (all real-world
 * marginal deduction rates are well under 100%), so bisection converges reliably.
 *
 * @returns {object} { requiredBasicPay, breakdown } where breakdown is the same shape as
 *   computePayroll's per-employee result, built from the solved basic pay.
 */
function solveGrossUp(targetNetPay, fixedOtherEarnings, fixedOtherDeductions, settings, payeBands) {
  var nssaRate = num_(settings.NSSA_EmployeeRate, 0.045);
  var nssaCeiling = num_(settings.NSSA_Ceiling, 700);
  var necRate = num_(settings.NEC_DefaultRate, 0.015);
  var aidsLevyRate = num_(settings.AidsLevyRate, 0.03);

  function netForBasic(B) {
    var gross = B + fixedOtherEarnings;
    var nssa = Math.min(B, nssaCeiling) * nssaRate;
    var nec = B * necRate;
    var paye = computePAYE(gross, payeBands, aidsLevyRate);
    return gross - nssa - nec - paye - fixedOtherDeductions;
  }

  var lo = 0;
  var hi = Math.max(1000, (targetNetPay + fixedOtherDeductions) * 3);
  // Expand hi until it brackets the target (guards against extreme inputs)
  var guard = 0;
  while (netForBasic(hi) < targetNetPay && guard < 40) {
    hi *= 2;
    guard++;
  }

  for (var i = 0; i < 60; i++) {
    var mid = (lo + hi) / 2;
    if (netForBasic(mid) < targetNetPay) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  var basicPay = round2_((lo + hi) / 2);
  var gross = basicPay + fixedOtherEarnings;
  var nssa = Math.min(basicPay, nssaCeiling) * nssaRate;
  var nec = basicPay * necRate;
  var paye = computePAYE(gross, payeBands, aidsLevyRate);
  var netPay = gross - nssa - nec - paye - fixedOtherDeductions;

  return {
    requiredBasicPay: basicPay,
    grossTaxablePay: round2_(gross),
    nssa: round2_(nssa),
    nec: round2_(nec),
    paye: round2_(paye),
    netPay: round2_(netPay)
  };
}

function num_(v, fallback) {
  var n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function round2_(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export { computePayroll, computePAYE, solveGrossUp };

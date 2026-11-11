(() => {
  "use strict";
  const SELECT_ID = "dcdsCurrencySelect";
  const CACHE_KEY = "dcds-global-currency-rates-v1";
  const RATE_URL = "https://open.er-api.com/v6/latest/NGN";
  const COUNTRY_CURRENCY = {
    NG:"NGN",US:"USD",GB:"GBP",IE:"EUR",DE:"EUR",FR:"EUR",IT:"EUR",ES:"EUR",
    PT:"EUR",NL:"EUR",BE:"EUR",AT:"EUR",FI:"EUR",GR:"EUR",CY:"EUR",MT:"EUR",
    LU:"EUR",SK:"EUR",SI:"EUR",EE:"EUR",LV:"EUR",LT:"EUR",HR:"EUR",
    CA:"CAD",AU:"AUD",NZ:"NZD",GH:"GHS",KE:"KES",ZA:"ZAR",UG:"UGX",
    TZ:"TZS",RW:"RWF",IN:"INR",PK:"PKR",BD:"BDT",JP:"JPY",CN:"CNY",
    HK:"HKD",SG:"SGD",MY:"MYR",ID:"IDR",PH:"PHP",TH:"THB",VN:"VND",
    AE:"AED",SA:"SAR",QA:"QAR",KW:"KWD",BH:"BHD",OM:"OMR",EG:"EGP",
    MA:"MAD",BR:"BRL",MX:"MXN",AR:"ARS",CL:"CLP",CO:"COP",PE:"PEN",
    CH:"CHF",SE:"SEK",NO:"NOK",DK:"DKK",PL:"PLN",CZ:"CZK",HU:"HUF",
    RO:"RON",BG:"BGN",TR:"TRY",UA:"UAH",IL:"ILS",KR:"KRW"
  };
  const FALLBACK_CURRENCIES = ["NGN","USD","GBP","EUR","CAD","AUD","NZD","GHS","KES","ZAR","UGX","TZS","RWF","INR","PKR","BDT","JPY","CNY","HKD","SGD","MYR","IDR","PHP","THB","VND","AED","SAR","QAR","KWD","BHD","OMR","EGP","MAD","BRL","MXN","ARS","CLP","COP","PEN","CHF","SEK","NOK","DKK","PLN","CZK","HUF","RON","BGN","TRY","UAH","ILS","KRW"];
  const numberFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits:0});
  let rates = {NGN:1};
  let currency = "NGN";
  let currencyNames;
  let regionalPrices = {};
  try { currencyNames = new Intl.DisplayNames([navigator.language || "en"], {type:"currency"}); } catch (_) { currencyNames = null; }

  function countryCode() {
    try {
      const locale = new Intl.Locale(navigator.language || "en-NG");
      return locale.region || "NG";
    } catch (_) { return "NG"; }
  }
  function preferredCurrency() { return COUNTRY_CURRENCY[countryCode()] || "USD"; }
  function savedCurrency() { try { return localStorage.getItem("dcds-global-currency-choice-v1") || ""; } catch (_) { return ""; } }
  function currencyName(code) {
    try { return currencyNames ? currencyNames.of(code) || code : code; } catch (_) { return code; }
  }
  function formatValue(amount, code) {
    try {
      return new Intl.NumberFormat(navigator.language || "en", {style:"currency", currency:code}).format(Number(amount || 0));
    } catch (_) { return code + " " + numberFormat.format(Number(amount || 0)); }
  }
  function format(amount) {
    return formatValue(Number(amount || 0) * Number(rates[currency] || 1), currency);
  }
  function regionalAmount(slug, code=currency) {
    return regionalPrices[slug + ":" + code];
  }
  function formatCourse(amount, slug) {
    const approved = regionalAmount(slug);
    return approved ? formatValue(approved.amount, currency) : format(amount);
  }
  function canCheckout(slug) {
    return currency === "NGN" || !!regionalAmount(slug);
  }
  function approvedCount() {
    return Object.keys(regionalPrices).filter(key => key.endsWith(":" + currency)).length;
  }
  function updatePrices() {
    document.querySelectorAll("[data-dcds-base-ngn]").forEach(node => {
      const base = Number(node.dataset.dcdsBaseNgn);
      if (!Number.isFinite(base)) return;
      const slug = node.dataset.dcdsCourseSlug || "";
      node.textContent = slug ? formatCourse(base, slug) : format(base);
      if (slug && currency !== "NGN" && !canCheckout(slug)) {
        node.title = "Indicative conversion only. This course does not yet have an approved " + currency + " checkout price.";
      } else {
        node.removeAttribute("title");
      }
    });
    const status = document.getElementById("dcdsCurrencyStatus");
    if (status) {
      const count = approvedCount();
      status.textContent = currency === "NGN"
        ? "12 courses · Showing Nigerian naira prices"
        : count + " of 13 products have approved " + currency + " prices";
    }
    const note = document.getElementById("dcdsCurrencyDisclaimer");
    if (note) note.textContent = currency === "NGN"
      ? "Prices are shown in Nigerian naira. Flutterwave checkout uses the approved NGN course price."
      : "Approved " + currency + " prices are shown where available. Other amounts are indicative conversions only and cannot be used for checkout until DCDS activates an approved price. Your final payment remains subject to Flutterwave's currency and account support.";
    const generalButton = document.getElementById("generalCourseBuy");
    if (generalButton && !generalButton.textContent.includes("CONTINUE LEARNING")) {
      generalButton.textContent = "Get the General Course — " + formatCourse(103000, "general-course");
    }
  }
  function populateSelector(select, available) {
    const codes = [...new Set(["NGN", ...available])].filter(code => /^[A-Z]{3}$/.test(code)).sort();
    select.replaceChildren();
    codes.forEach(code => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code + " — " + currencyName(code);
      select.appendChild(option);
    });
    const wanted = savedCurrency() || preferredCurrency();
    currency = codes.includes(wanted) ? wanted : "NGN";
    select.value = currency;
    select.addEventListener("change", () => {
      currency = codes.includes(select.value) ? select.value : "NGN";
      try { localStorage.setItem("dcds-global-currency-choice-v1", currency); } catch (_) {}
      updatePrices();
    });
    window.DCDSGlobalCurrency = {
      format,
      formatCourse,
      canCheckout,
      get currency(){return currency;},
      get rates(){return {...rates};},
      get regionalPrices(){return {...regionalPrices};}
    };
    updatePrices();
  }
  async function loadRates() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.date === new Date().toISOString().slice(0,10) && cached.rates && cached.rates.NGN === 1) {
        rates = cached.rates;
        return true;
      }
    } catch (_) {}
    try {
      const response = await fetch(RATE_URL, {headers:{Accept:"application/json"}, cache:"no-store"});
      if (!response.ok) throw new Error("Exchange-rate service unavailable");
      const data = await response.json();
      if (data.result !== "success" || !data.rates || !Number.isFinite(Number(data.rates.USD))) throw new Error("Invalid exchange-rate response");
      rates = {NGN:1};
      Object.entries(data.rates).forEach(([code, rate]) => {
        if (/^[A-Z]{3}$/.test(code) && Number.isFinite(Number(rate)) && Number(rate) > 0) rates[code] = Number(rate);
      });
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({date:new Date().toISOString().slice(0,10),rates})); } catch (_) {}
      return true;
    } catch (error) {
      console.warn("DCDS currency conversion unavailable; showing NGN prices.", error);
      rates = {NGN:1};
      return false;
    }
  }
  async function loadRegionalPrices() {
    try {
      if (typeof supabaseClient === "undefined" || !supabaseClient) return;
      const [{data:courses,error:courseError},{data:prices,error:priceError}] = await Promise.all([
        supabaseClient.from("courses").select("id,slug"),
        supabaseClient.from("course_regional_prices").select("course_id,currency,amount").eq("is_active",true)
      ]);
      if (courseError || priceError) throw courseError || priceError;
      const slugById = Object.fromEntries((courses || []).map(course => [course.id, course.slug]));
      regionalPrices = {};
      (prices || []).forEach(price => {
        const slug = slugById[price.course_id];
        const amount = Number(price.amount);
        if (slug && /^[A-Z]{3}$/.test(price.currency) && Number.isFinite(amount) && amount > 0) {
          regionalPrices[slug + ":" + price.currency] = {amount, currency:price.currency};
        }
      });
      return true;
    } catch (error) {
      console.warn("DCDS approved regional prices could not be loaded; showing reference conversions.", error);
      regionalPrices = {};
      return false;
    }
  }
  async function init() {
    const select = document.getElementById(SELECT_ID);
    if (!select) return;
    const cached = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (_) { return null; } })();
    if (cached?.rates?.NGN === 1) rates = cached.rates;
    const supported = typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("currency").filter(code => rates[code] || FALLBACK_CURRENCIES.includes(code))
      : FALLBACK_CURRENCIES;
    populateSelector(select, [...supported, ...FALLBACK_CURRENCIES]);
    await Promise.all([loadRates(), loadRegionalPrices()]);
    const allCodes = Object.keys(rates).filter(code => /^[A-Z]{3}$/.test(code));
    const options = new Set([...select.options].map(option => option.value));
    allCodes.forEach(code => {
      if (options.has(code)) return;
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code + " — " + currencyName(code);
      select.appendChild(option);
    });
    const wanted = savedCurrency() || preferredCurrency();
    const current = select.value;
    const finalChoice = rates[wanted] ? wanted : (rates[current] ? current : "NGN");
    currency = finalChoice;
    select.value = finalChoice;
    updatePrices();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();

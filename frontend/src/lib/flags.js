// Resolve an emoji flag from a country name. The match feed only gives us a
// team name (and sometimes a crest image), never an emoji flag, so we map the
// name to an ISO 3166-1 alpha-2 code and build the regional-indicator emoji.
// Unknown names return null so callers can fall back to initials.

const NAME_TO_ISO = {
  Argentina: "AR",
  Australia: "AU",
  Austria: "AT",
  Belgium: "BE",
  Bolivia: "BO",
  Brazil: "BR",
  Cameroon: "CM",
  Canada: "CA",
  Chile: "CL",
  Colombia: "CO",
  "Costa Rica": "CR",
  "Côte d'Ivoire": "CI",
  "Ivory Coast": "CI",
  Croatia: "HR",
  Czechia: "CZ",
  "Czech Republic": "CZ",
  Denmark: "DK",
  Ecuador: "EC",
  Egypt: "EG",
  Finland: "FI",
  France: "FR",
  Germany: "DE",
  Ghana: "GH",
  Greece: "GR",
  Honduras: "HN",
  Hungary: "HU",
  Iceland: "IS",
  Iran: "IR",
  "IR Iran": "IR",
  Italy: "IT",
  Jamaica: "JM",
  Japan: "JP",
  "Korea Republic": "KR",
  "South Korea": "KR",
  Mexico: "MX",
  Morocco: "MA",
  Netherlands: "NL",
  "New Zealand": "NZ",
  Nigeria: "NG",
  Norway: "NO",
  Panama: "PA",
  Paraguay: "PY",
  Peru: "PE",
  Poland: "PL",
  Portugal: "PT",
  Qatar: "QA",
  "Republic of Ireland": "IE",
  Ireland: "IE",
  Romania: "RO",
  "Saudi Arabia": "SA",
  Senegal: "SN",
  Serbia: "RS",
  Slovakia: "SK",
  Slovenia: "SI",
  "South Africa": "ZA",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Tunisia: "TN",
  Turkey: "TR",
  "Türkiye": "TR",
  Ukraine: "UA",
  "United States": "US",
  "United States of America": "US",
  USA: "US",
  Uruguay: "UY",
  Uzbekistan: "UZ",
};

// Home-nation flags aren't ISO countries, so store their emoji directly.
const SPECIAL = {
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};

const isoToEmoji = (iso) =>
  iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

export const flagFor = (name) => {
  if (!name) return null;
  if (SPECIAL[name]) return SPECIAL[name];
  const iso = NAME_TO_ISO[name];
  return iso ? isoToEmoji(iso) : null;
};

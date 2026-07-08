// A mapping of common Infinite Flight livery names to their official website domains
// Used to fetch logos from Clearbit
export const getAirlineDomain = (liveryName) => {
  if (!liveryName) return null;
  
  const normalized = liveryName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const domainMap = {
    'deltaairlines': 'delta.com',
    'delta': 'delta.com',
    'americanairlines': 'aa.com',
    'american': 'aa.com',
    'unitedairlines': 'united.com',
    'united': 'united.com',
    'southwestairlines': 'southwest.com',
    'southwest': 'southwest.com',
    'jetblue': 'jetblue.com',
    'jetblueairways': 'jetblue.com',
    'alaskaairlines': 'alaskaair.com',
    'alaska': 'alaskaair.com',
    'spiritairlines': 'spirit.com',
    'spirit': 'spirit.com',
    'frontierairlines': 'flyfrontier.com',
    'frontier': 'flyfrontier.com',
    'aircanada': 'aircanada.com',
    'westjet': 'westjet.com',
    'britishairways': 'britishairways.com',
    'virginatlantic': 'virginatlantic.com',
    'easyjet': 'easyjet.com',
    'ryanair': 'ryanair.com',
    'lufthansa': 'lufthansa.com',
    'airfrance': 'airfrance.com',
    'klm': 'klm.com',
    'klmroyaldutchairlines': 'klm.com',
    'swiss': 'swiss.com',
    'swissinternationalairlines': 'swiss.com',
    'iberia': 'iberia.com',
    'alitalia': 'alitalia.com',
    'itaairways': 'ita-airways.com',
    'aerlingus': 'aerlingus.com',
    'qatarairways': 'qatarairways.com',
    'qatar': 'qatarairways.com',
    'emirates': 'emirates.com',
    'etihadairways': 'etihad.com',
    'etihad': 'etihad.com',
    'saudia': 'saudia.com',
    'singaporeairlines': 'singaporeair.com',
    'cathaypacific': 'cathaypacific.com',
    'ana': 'ana.co.jp',
    'allnipponairways': 'ana.co.jp',
    'japanairlines': 'jal.co.jp',
    'jal': 'jal.co.jp',
    'koreanair': 'koreanair.com',
    'evaair': 'evaair.com',
    'chinaairlines': 'china-airlines.com',
    'airnz': 'airnewzealand.com',
    'airnewzealand': 'airnewzealand.com',
    'qantas': 'qantas.com',
    'virginaustralia': 'virginaustralia.com',
    'latam': 'latam.com',
    'latamairlines': 'latam.com',
    'avianca': 'avianca.com',
    'aeromexico': 'aeromexico.com',
    'copaairlines': 'copaair.com',
    'fedex': 'fedex.com',
    'ups': 'ups.com',
    'dhl': 'dhl.com',
    'qatarairwayscargo': 'qatarairways.com',
    'emiratesskycargo': 'emirates.com',
    'cathaypacificcargo': 'cathaypacific.com',
    'lufthansacargo': 'lufthansa.com'
  };

  // If we have an exact match in our dictionary
  if (domainMap[normalized]) {
    return domainMap[normalized];
  }

  // Fallback: Try to guess the domain for airlines that usually use airline.com
  // Example: "Indigo" -> "indigo.com" (might be wrong, but Clearbit usually handles aliases)
  if (normalized.length > 3 && !normalized.includes('generic') && !normalized.includes('factory')) {
    // A lot of airlines have the word 'airlines' or 'airways' in the IF livery name
    let guess = normalized.replace('airlines', '').replace('airways', '');
    return `${guess}.com`;
  }

  return null;
};

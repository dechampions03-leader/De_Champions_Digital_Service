/* DCDS Smart Celebration Calendar — Nigeria-local automatic event display */
(() => {
  'use strict';
  const root = document.getElementById('dcds-celebration-display');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  const zone = 'Africa/Lagos';
  const hourMs = 3600000, dayMs = 86400000;
  const fmtParts = new Intl.DateTimeFormat('en-GB', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const dateFmt = new Intl.DateTimeFormat('en-GB', {timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const weekdayFmt = new Intl.DateTimeFormat('en-GB', {timeZone:zone,weekday:'long'});
  const monthYearFmt = new Intl.DateTimeFormat('en-GB', {timeZone:zone,month:'long',year:'numeric'});
  const clockFmt = new Intl.DateTimeFormat('en-NG', {timeZone:zone,hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
  let hijriFormatter=null;
  try{
    hijriFormatter=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric'});
  }catch(_){
    try{hijriFormatter=new Intl.DateTimeFormat('en-u-ca-islamic-civil',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric'});}catch(__){}
  }
  const $ = id => root.querySelector('#' + id);
  const pad = n => String(n).padStart(2, '0');
  const sceneProfiles = [
    {key:'braille-refined',test:/world braille day/i,main:'⠿',props:['🤝','💜','📖']},
    {key:'cultural-diversity-refined',test:/world day for cultural diversity|nigerian fashion festival/i,main:'🌍',props:['🎨','🧵','🪡']},
    {key:'public-service-refined',test:/united nations public service day|united nations day/i,main:'🏛️',props:['🤝','📜','🌐']},
    {key:'small-business-refined',test:/micro, small and medium|small businesses/i,main:'🏪',props:['📈','💡','🤝']},
    {key:'mandela-refined',test:/nelson mandela/i,main:'🤝',props:['🕊️','✊🏿','⭐']},
    {key:'international-democracy-refined',test:/international day of democracy/i,main:'🗳️',props:['⚖️','📜','🤝']},
    {key:'africa-science-refined',test:/world science day|scientific renaissance/i,main:'🔬',props:['👩🏽‍🔬','🌍','💡']},
    {key:'volunteer-refined',test:/international volunteer day/i,main:'🤲',props:['❤️','🕊️','🌍']},
    {key:'migrant-solidarity',test:/international migrants day/i,main:'🌍',props:['🧳','🤝','🏠']},
    {key:'youth-skills-refined',test:/world youth skills day/i,main:'🚀',props:['💡','🎓','🛠️']},
    {key:'independence-refined',test:/nigeria independence day/i,main:'🇳🇬',props:['⭐','🎆','🌱']},
    {key:'africa-environment-refined',test:/africa environment|wangari maathai/i,main:'🌳',props:['🌍','🍃','🌱']},
    {key:'africa-local-development',test:/africa day of decentralisation/i,main:'🏘️',props:['🏛️','🤝','🌍']},
    {key:'commonwealth-refined',test:/commonwealth day/i,main:'🌐',props:['🤝','⭐','🌍']},
    {key:'argungu-refined',test:/argungu/i,main:'🐟',props:['🛶','🎣','🌊']},
    {key:'tour-nigeria-refined',test:/tour nigeria|bus tour nigeria/i,main:'🚌',props:['🧳','🗺️','🇳🇬']},
    {key:'new-yam-refined',test:/new yam|iwa ji|iri ji/i,main:'🍠',props:['🌾','🥁','🌱']},
    {key:'osun-refined',test:/osun-osogbo/i,main:'🌊',props:['🌿','🪘','✨']},
    {key:'sango-refined',test:/sango festival/i,main:'⚡',props:['🥁','🔥','🌩️']},
    {key:'ige-agba-refined',test:/ige-agba/i,main:'🌾',props:['🥁','🌱','🎭']},
    {key:'igbogo-refined',test:/igbogo/i,main:'🎭',props:['🌾','✨','🥁']},
    {key:'olojo-refined',test:/olojo/i,main:'👑',props:['⚔️','🌅','✨']},
    {key:'ofala-refined',test:/ofala/i,main:'👑',props:['🦚','🥁','🌿']},
    {key:'flavours-refined',test:/flavours of nigeria/i,main:'🍲',props:['🌾','🥘','👩🏽‍🍳']},
    {key:'mmanwu-refined',test:/mmanwu|masquerade/i,main:'🎭',props:['🥁','🪘','🪶']},
    {key:'beach-refined',test:/beach festival/i,main:'🏖️',props:['🌴','🌊','☀️']},
    {key:'igue-refined',test:/igue festival/i,main:'👑',props:['🐆','🥁','✨']},
    {key:'music-festival-refined',test:/music festival/i,main:'🎤',props:['🎸','🥁','🎵']},
    {key:'countdown-festival-refined',test:/countdown nigeria/i,main:'🎆',props:['🎊','✨','⏳']},
    {key:'eid-durbar-refined',test:/eid durbar|durbar festival/i,main:'🐎',props:['👑','🥁','🏇']},
    {key:'isese-day-specific',test:/isese day/i,main:'🪘',props:['🌿','📿','🎭']},
    {key:'earth-day-specific',test:/earth day/i,main:'🌍',props:['🌱','♻️','🍃']},
    {key:'blood-donor-awareness',test:/blood donor/i,main:'🩸',props:['❤️','🤝','🩺']},
    {key:'peace-observance',test:/international day of peace|peace and reconciliation/i,main:'🕊️',props:['🫒','🤝','🌍']},
    {key:'africa-day-specific',test:/^africa day$/i,main:'🌍',props:['🤝','🌱','⭐']},
    {key:'africa-school-feeding',test:/school feeding/i,main:'🍲',props:['🥗','📚','🌍']},
    {key:'africa-traditional-medicine',test:/traditional medicine/i,main:'🌿',props:['🩺','📖','🌍']},
    {key:'africa-human-rights',test:/africa human rights/i,main:'⚖️',props:['🤝','🕊️','🌍']},
    {key:'africa-youth-specific',test:/africa youth day/i,main:'🌍',props:['🚀','🎓','⭐']},
    {key:'national-youth-specific',test:/national youth day/i,main:'🇳🇬',props:['🚀','🎓','💡']},
    {key:'african-union-specific',test:/african union day|africa border day|african integration day/i,main:'🌍',props:['🤝','🕊️','⭐']},
    {key:'african-sport-specific',test:/day of african sport/i,main:'🏅',props:['⚽','🏃🏽','🌍']},
    {key:'statistics-specific',test:/statistics day/i,main:'📊',props:['📈','🧮','🌍']},
    {key:'industrialisation-specific',test:/industrialisation day/i,main:'🏭',props:['⚙️','📈','💡']},
    {key:'telecommunications-specific',test:/telecommunications and ict/i,main:'📡',props:['🌐','📱','💡']},
    {key:'food-security-specific',test:/food security|food day/i,main:'🌾',props:['🍲','🥗','🌱']},
    {key:'habitat-specific',test:/habitat|cities day/i,main:'🏘️',props:['🌳','🏙️','🌱']},
    {key:'maritime-specific',test:/maritime day|seas and oceans/i,main:'⚓',props:['🌊','🚢','🐢']},
    {key:'clean-energy-specific',test:/clean energy/i,main:'⚡',props:['☀️','🌬️','🔋']},
    {key:'tolerance-specific',test:/day for tolerance/i,main:'🤝',props:['🌍','🕊️','💜']},
    {key:'friendship-specific',test:/day of friendship/i,main:'🫶',props:['🤝','💗','🌍']},
    {key:'solidarity-specific',test:/solidarity/i,main:'🤝',props:['🫶','🌍','🕊️']},
    {key:'world-art-specific',test:/world art day|international dance day|world theatre day/i,main:'🎨',props:['🎭','💃','🖌️']},
    {key:'poetry-specific',test:/poetry day/i,main:'✍️',props:['📖','🖋️','🌹']},
    {key:'family-day-specific',test:/day of families/i,main:'👨‍👩‍👧‍👦',props:['🏡','🤝','💗']},
    {key:'world-population-specific',test:/population day/i,main:'🌍',props:['👥','🏙️','🤝']},
    {key:'humanitarian-specific',test:/humanitarian day/i,main:'🤲',props:['🕊️','❤️','🌍']},
    {key:'world-tourism-specific',test:/world tourism day/i,main:'🧳',props:['🚌','🏞️','🇳🇬']},
    {key:'islamic-new-year-specific',test:/al-hijra|islamic new year/i,main:'🌙',props:['🕌','📖','⭐']},
    {key:'new-year-specific',test:/new year/i,main:'🎆',props:['🎊','✨','🥂']},
    {key:'valentines-specific',test:/valentine/i,main:'💌',props:['🌹','💗','🤝']},
    {key:'boxing-day-specific',test:/boxing day/i,main:'🎁',props:['🎀','💝','🤲']},
    {key:'family-father-specific',test:/father.s day/i,main:'👨🏽‍👧',props:['🤝','💙','⭐']},
    {key:'women-day-specific',test:/international women.s day|women.s day/i,main:'👩🏽',props:['💜','🌸','⭐']},
    {key:'violence-against-women',test:/elimination of violence against women|violence against women/i,main:'🧡',props:['🎗️','🛡️','🤝']},
    {key:'human-trafficking-awareness',test:/trafficking in persons|human trafficking/i,main:'🛡️',props:['🕊️','🤝','🧡']},
    {key:'holocaust-remembrance',test:/holocaust/i,main:'🕯️',props:['🕊️','🌼','📖']},
    {key:'slave-trade-remembrance',test:/slave trade|abolition/i,main:'🕯️',props:['🕊️','📜','🌿']},
    {key:'armed-forces-remembrance',test:/armed forces.*remembrance|remembrance.*armed forces/i,main:'🎖️',props:['🌺','🕯️','🕊️']},
    {key:'cuito-remembrance',test:/cuito cuanavale|battle of/i,main:'🕯️',props:['🕊️','📜','🌿']},
    {key:'racial-equality',test:/elimination of racial discrimination|racial discrimination/i,main:'🤝',props:['⚖️','🌍','🕊️']},
    {key:'women-science-specific',test:/women and girls in science/i,main:'🔬',props:['👩🏽‍🔬','💡','📚']},
    {key:'girl-child-rights',test:/girl child/i,main:'👧🏽',props:['📚','🛡️','🌟']},
    {key:'children-rights-specific',test:/world children.s day|children.s rights/i,main:'🧒🏽',props:['📚','🛡️','🤝']},
    {key:'african-child-rights',test:/day of the african child|african day of the child/i,main:'🧒🏾',props:['📚','🛡️','🌍']},
    {key:'autism-acceptance',test:/autism/i,main:'♾️',props:['🫶','🌈','💙']},
    {key:'disability-inclusion',test:/persons with disabilities|disabilit|accessibility/i,main:'♿',props:['🤝','🌐','💜']},
    {key:'cancer-awareness',test:/cancer/i,main:'🎗️',props:['🩺','🫶','💗']},
    {key:'hiv-awareness',test:/aids day|hiv/i,main:'❤️',props:['🎗️','🤝','🕯️']},
    {key:'tropical-disease-awareness',test:/neglected tropical|tropical diseases|tuberculosis|malaria|hepatitis/i,main:'🩺',props:['🔬','🛡️','💚']},
    {key:'diabetes-awareness',test:/diabetes/i,main:'🩺',props:['🩸','💙','🤝']},
    {key:'mental-health-awareness',test:/mental health/i,main:'💚',props:['🫶','🧠','🌿']},
    {key:'no-tobacco-awareness',test:/no tobacco/i,main:'🚭',props:['🫁','💚','⚕️']},
    {key:'health-awareness',test:/world health day|blood donor|health day/i,main:'🩺',props:['🫀','🤝','💚']},
    {key:'refugee-solidarity',test:/refugee/i,main:'🕊️',props:['🏠','🤝','🌍']},
    {key:'press-freedom-specific',test:/press freedom/i,main:'📰',props:['🎙️','🖋️','🕊️']},
    {key:'human-rights-specific',test:/human rights/i,main:'⚖️',props:['🤝','🕊️','📜']},
    {key:'anti-corruption-specific',test:/anti-corruption|corruption/i,main:'⚖️',props:['🔎','🤝','🛡️']},
    {key:'justice-advocacy',test:/social justice|justice|tolerance|discrimination/i,main:'⚖️',props:['🤝','🕊️','🌍']},
    {key:'violence-prevention',test:/violence|safety and health at work|drowning prevention/i,main:'🛡️',props:['🤝','⚠️','🕊️']},
    {key:'indigenous-peoples-rights',test:/indigenous peoples/i,main:'🌿',props:['🪶','📜','🌍']},
    {key:'sign-language-inclusion',test:/sign languages|mother language/i,main:'🤟',props:['🗣️','🤝','🌍']},
    {key:'environment-action',test:/environment day|earth day|ozone|zero waste|forests|wildlife|habitat|climate/i,main:'🌍',props:['🌱','♻️','🍃']},
    {key:'water-protection',test:/water day|water safety|drowning/i,main:'💧',props:['🚰','🌊','🌱']},
    {key:'peace-remembrance',test:/day of peace|peace and reconciliation/i,main:'🕊️',props:['🫒','🤝','🌍']},
    {key:'holocaust-remembrance-reserved',test:/never-match-this/i,main:'🕯️',props:['🕊️','🌼','📖']},
    {key:'ramadan-specific',test:/ramadan|laylat al-qadr/i,main:'🌙',props:['🕌','🤲','📿']},
    {key:'arafah-specific',test:/arafah/i,main:'🕋',props:['🤲','🌅','📿']},
    {key:'ashura-specific',test:/ashura/i,main:'🌙',props:['📖','🤲','🕊️']},
    {key:'eid-specific',test:/eid al-fitr|eid-el-fitr|eid al-adha|eid-el-kabir|eid holiday/i,main:'🌙',props:['🕌','🏮','🎁']},
    {key:'mawlid-specific',test:/mawlid|maulud/i,main:'🕌',props:['🌙','📿','✨']},
    {key:'hijri-specific',test:/al-hijra|islamic new year/i,main:'🌙',props:['🕌','📖','⭐']},
    {key:'good-friday-specific',test:/good friday/i,main:'✝️',props:['🕯️','🌿','🕊️']},
    {key:'ash-wednesday-specific',test:/ash wednesday/i,main:'✝️',props:['🕯️','🙏','🌿']},
    {key:'palm-sunday-specific',test:/palm sunday/i,main:'🌿',props:['✝️','🕊️','🌱']},
    {key:'maundy-thursday-specific',test:/maundy thursday/i,main:'🕯️',props:['🍞','🍷','✝️']},
    {key:'holy-saturday-specific',test:/holy saturday/i,main:'🕯️',props:['🕊️','🌿','✨']},
    {key:'easter-sunday-specific',test:/easter sunday/i,main:'✝️',props:['🌅','🌷','🕊️']},
    {key:'christmas-specific',test:/christmas/i,main:'🎄',props:['🎁','❄️','🛷']},
    {key:'independence-specific',test:/independence day|nigeria independence/i,main:'🇳🇬',props:['🇳🇬','⭐','🎆']},
    {key:'democracy-specific',test:/democracy day/i,main:'🗳️',props:['🇳🇬','⚖️','🤝']},
    {key:'police-service',test:/national police day/i,main:'👮🏾',props:['🛡️','⭐','🤝']},
    {key:'national-youth-specific',test:/national youth day/i,main:'🇳🇬',props:['🚀','🎓','💡']},
    {key:'workers-recognition',test:/workers.day|labour day/i,main:'🦺',props:['⚙️','🛠️','🤝']},
    {key:'teachers-recognition',test:/teachers.? day/i,main:'📚',props:['✏️','🎓','🍎']},
    {key:'nurses-recognition',test:/nurses day/i,main:'🩺',props:['❤️','🤝','🌿']},
    {key:'education-recognition',test:/day of education|literacy day|book and copyright/i,main:'📚',props:['🎓','✏️','💡']},
    {key:'women-recognition',test:/women.s day|africa.s women day/i,main:'👩🏽',props:['🌸','💜','⭐']},
    {key:'family-appreciation',test:/mothering sunday|father.s day|day of families/i,main:'💗',props:['🌷','🏡','🤝']},
    {key:'national-army-service',test:/nigerian army day/i,main:'🎖️',props:['🛡️','🇳🇬','⭐']},
    {key:'national-air-force-service',test:/air force day/i,main:'✈️',props:['🇳🇬','🛡️','⭐']},
    {key:'national-navy-service',test:/navy day/i,main:'⚓',props:['🇳🇬','🌊','⭐']},
    {key:'autism', test:/autism/i, props:['🧩','🫶','💙']},
    {key:'water-safety', test:/drowning prevention|water safety/i, props:['🛟','🌊','🫧']},
    {key:'indigenous-peoples', test:/indigenous peoples/i, props:['🌿','🪶','🌍']},
    {key:'men', test:/men.s day/i, props:['🤝','💙','⭐']},
    {key:'aids-awareness', test:/aids day/i, props:['❤️','🎗️','🤝']},
    {key:'african-history', test:/cuito|battle of/i, props:['🕊️','🌍','🕯️']},
    {key:'ash-wednesday', test:/ash wednesday/i, props:['✝️','🕯️','🌿']},
    {key:'palm-sunday', test:/palm sunday/i, props:['🌿','✝️','🕊️']},
    {key:'maundy-thursday', test:/maundy thursday/i, props:['🕯️','🍞','🍷']},
    {key:'holy-saturday', test:/holy saturday/i, props:['🕯️','🕊️','✨']},
    {key:'commonwealth', test:/commonwealth/i, props:['🌐','🤝','⭐']},
    {key:'tour-nigeria', test:/tour nigeria/i, props:['🚌','🧳','🇳🇬']},
    {key:'sango', test:/sango/i, props:['⚡','🥁','🔥']},
    {key:'beer-festival', test:/beer festival/i, props:['🍺','🎶','🎪']},
    {key:'africa-women', test:/africa.s women day/i, props:['💜','🌍','🌸']},
    {key:'africa-food', test:/school feeding|food security|nutrition/i, props:['🍲','🌾','🌍']},
    {key:'africa-development', test:/decentralisation|local development|civil registration|africa border|african integration/i, props:['🏘️','🤝','🌍']},
    {key:'africa-industry', test:/industrialisation/i, props:['🏭','⚙️','📈']},
    {key:'traditional-medicine', test:/traditional medicine/i, props:['🌿','🩺','🌍']},
    {key:'africa-youth', test:/africa youth day/i, props:['🌍','🚀','⭐']},
    {key:'national-youth', test:/national youth day/i, props:['🇳🇬','🚀','🎓']},
    {key:'african-peace', test:/african day of peace/i, props:['🕊️','🌍','✨']},
    {key:'africa-environment', test:/africa environment|wangari maathai/i, props:['🌳','🌍','🍃']},
    {key:'africa-child', test:/african day of the child|day of the african child/i, props:['🧒🏾','🌍','🎓']},
    {key:'africa-science', test:/scientific renaissance|science/i, props:['🔬','🌍','💡']},
    {key:'africa-sport', test:/african sport/i, props:['🏅','⚽','🌍']},
    {key:'africa-statistics', test:/statistics/i, props:['📊','🌍','📈']},
    {key:'national-police', test:/national police day/i, props:['👮🏾','🛡️','⭐']},
    {key:'africa-union', test:/african union|africa border|african integration|africa day|african public service/i, props:['🌍','🤝','⭐']},
    {key:'hijri', test:/al-hijra|islamic new year/i, props:['🏮','🕌','⭐']},
    {key:'mawlid', test:/mawlid/i, props:['🕌','🏮','🌙']},
    {key:'new-year', test:/new year/i, props:['🎊','✨','🥂']},
    {key:'valentine', test:/valentine/i, props:['🌹','💌','💗']},
    {key:'women', test:/women/i, props:['🌸','✊🏽','✨']},
    {key:'happiness', test:/happiness/i, props:['🎈','🌈','☀️']},
    {key:'water', test:/water day/i, props:['🌊','🫧','💦']},
    {key:'health', test:/health day/i, props:['➕','🩺','💚']},
    {key:'earth', test:/earth day/i, props:['🍃','🦋','🌱']},
    {key:'workers', test:/workers/i, props:['⚙️','🔧','⭐']},
    {key:'children', test:/children/i, props:['🎈','🧸','🪁']},
    {key:'environment', test:/environment/i, props:['🍃','🦋','🌼']},
    {key:'democracy', test:/democracy/i, props:['🇳🇬','🗳️','⭐']},
    {key:'skills', test:/youth skills/i, props:['🚀','💡','🎓']},
    {key:'youth', test:/youth/i, props:['🌟','🚀','🎨']},
    {key:'peace', test:/peace/i, props:['🕊️','🫒','🤍']},
    {key:'independence', test:/independence/i, props:['🇳🇬','⭐','🎆']},
    {key:'teachers', test:/teachers/i, props:['📚','✏️','🎓']},
    {key:'christmas', test:/christmas/i, props:['🎁','❄️','🛷']},
    {key:'boxing', test:/boxing day/i, props:['🎀','💝','✨']},
    {key:'mothering', test:/mothering|mother'?s day/i, props:['🌷','💗','🌹']},
    {key:'eid-durbar', test:/eid durbar|durbar festival/i, props:['🐎','👑','🥁']},
    {key:'eid', test:/eid/i, props:['🌙','🏮','⭐']},
    {key:'good-friday', test:/good friday/i, props:['🕊️','🌿','✨']},
    {key:'easter-monday', test:/easter monday/i, props:['🐇','🌷','🦋']},
    {key:'easter', test:/easter/i, props:['🐣','🌷','🦋']},
    {key:'isese', test:/isese day/i, props:['🪘','🌿','🎭']},
    {key:'fathers', test:/father/i, props:['👔','🎖️','⭐']},
    {key:'armed-forces', test:/armed forces|remembrance day/i, props:['🎖️','🕊️','⭐']},
    {key:'braille', test:/braille|disabilit|accessibility/i, props:['⠿','🤝','💜']},
    {key:'education', test:/education|literacy|book/i, props:['📚','🎓','✏️']},
    {key:'clean-energy', test:/clean energy|telecommunication|information society/i, props:['⚡','🌐','💡']},
    {key:'remembrance', test:/holocaust|slave trade|remembrance/i, props:['🕯️','🕊️','✨']},
    {key:'tropical-health', test:/tropical diseases|cancer|tuberculosis|malaria|hepatitis|diabetes/i, props:['🎗️','🩺','💚']},
    {key:'women-science', test:/women and girls in science/i, props:['🔬','🌸','💡']},
    {key:'justice', test:/social justice|racial discrimination|human rights|anti-corruption/i, props:['⚖️','🤝','✨']},
    {key:'languages', test:/mother language|sign languages|translation/i, props:['🗣️','📖','🌍']},
    {key:'wildlife', test:/wildlife|forest/i, props:['🦋','🌳','🍃']},
    {key:'science', test:/science|meteorological|technology/i, props:['🔬','🧪','💡']},
    {key:'theatre', test:/theatre|dance|art day/i, props:['🎭','🎨','💃']},
    {key:'zero-waste', test:/zero waste|no tobacco|environment/i, props:['♻️','🌱','🍃']},
    {key:'air-force', test:/air force/i, props:['✈️','☁️','⭐']},
    {key:'books', test:/book|copyright/i, props:['📚','✒️','✨']},
    {key:'workplace', test:/safety and health at work|workers/i, props:['🦺','⚙️','⭐']},
    {key:'press', test:/press freedom/i, props:['📰','🎙️','✒️']},
    {key:'nursing', test:/nurses|blood donor/i, props:['🩺','❤️','🤝']},
    {key:'family', test:/families/i, props:['👨‍👩‍👧‍👦','🏡','💗']},
    {key:'africa', test:/africa day|african child/i, props:['🌍','🇳🇬','⭐']},
    {key:'navy', test:/navy day|maritime|boat show/i, props:['⚓','🌊','🚢']},
    {key:'public-service', test:/public service|united nations/i, props:['🏛️','🤝','🌐']},
    {key:'small-business', test:/small businesses|micro, small|business/i, props:['🏪','📈','💡']},
    {key:'population', test:/population|refugee|migrant/i, props:['🌍','🤝','🕊️']},
    {key:'army', test:/army day/i, props:['🎖️','🛡️','⭐']},
    {key:'mandela', test:/mandela/i, props:['🤝','🕊️','⭐']},
    {key:'friendship', test:/friendship|solidarity|tolerance/i, props:['🫶','🤝','💜']},
    {key:'trafficking', test:/trafficking|violence against women/i, props:['🕊️','🧡','🤝']},
    {key:'breastfeeding', test:/breastfeeding/i, props:['🤱','💗','🌼']},
    {key:'humanitarian', test:/humanitarian|volunteer/i, props:['🤲','❤️','🌍']},
    {key:'literacy', test:/literacy|poetry/i, props:['📖','✍️','✨']},
    {key:'ozone', test:/ozone|habitat|cities/i, props:['🌎','🏙️','🍃']},
    {key:'tourism', test:/tourism|bus tour/i, props:['🚌','🧳','🌍']},
    {key:'mental-health', test:/mental health/i, props:['💚','🫶','🌿']},
    {key:'girl-child', test:/girl child|girl/i, props:['👧🏾','🌸','⭐']},
    {key:'food', test:/food|flavours/i, props:['🌾','🍲','🥘']},
    {key:'diabetes', test:/diabetes/i, props:['🩺','💙','🤝']},
    {key:'children-rights', test:/children/i, props:['🧒🏾','🎈','🧸']},
    {key:'volunteer', test:/volunteer|migrants/i, props:['🤲','🌍','❤️']},
    {key:'cultural-diversity', test:/cultural diversity|fashion festival/i, props:['🎨','🧵','🌍']},
    {key:'ramadan', test:/ramadan|laylat al-qadr|arafah|ashura/i, props:['🌙','🏮','⭐']},
    {key:'argungu', test:/argungu|fishing festival/i, props:['🐟','🛶','🌊']},
    {key:'osun', test:/osun/i, props:['🌊','🌿','✨']},
    {key:'new-yam', test:/new yam|iwa ji|iri ji/i, props:['🌾','🍠','🎉']},
    {key:'durbar', test:/durbar/i, props:['🐎','👑','🥁']},
    {key:'ige-agba', test:/ige-agba/i, props:['🌾','🥁','🎭']},
    {key:'igbogo', test:/igbogo/i, props:['🎭','🌾','✨']},
    {key:'mmanwu', test:/mmanwu|masquerade/i, props:['🎭','🥁','🪘']},
    {key:'olojo', test:/olojo/i, props:['👑','⚔️','✨']},
    {key:'ofala', test:/ofala/i, props:['👑','🦚','🥁']},
    {key:'igue', test:/igue/i, props:['👑','🐆','✨']},
    {key:'calabar', test:/calabar|carnival/i, props:['🎊','💃','🎭']},
    {key:'nyalo', test:/nyalo/i, props:['🎭','🥁','🎉']},
    {key:'beach', test:/beach festival/i, props:['🏖️','🌊','☀️']},
    {key:'music-festival', test:/music festival/i, props:['🎵','🎤','🎸']},
    {key:'countdown-festival', test:/countdown nigeria/i, props:['🎆','🎊','✨']}
  ];
  const sceneForEvent = name => sceneProfiles.find(profile=>profile.test.test(name)) || {
    key:'celebration', props:['✨','🎉','⭐']
  };
  const categoryForEvent = name => {
    if(/new year.s day|workers.day|democracy day \(nigeria\)|nigeria independence day|christmas day|boxing day|good friday|easter monday/i.test(name)) return 'Nigerian public holiday';
    if(/armed forces|air force day|navy day|army day|children.s day \(nigeria\)/i.test(name)) return 'Nigerian national observance';
    if(/isese day/i.test(name)) return 'State-level observance · participating South-West states';
    if(/national police day|national youth day/i.test(name)) return 'Nigerian national observance';
    if(/african|africa/i.test(name)) return 'African Union observance';
    if(/ramadan|eid|al-hijra|ashura|mawlid|ash wednesday|palm sunday|maundy thursday|holy saturday|easter sunday|mothering sunday/i.test(name)) return 'Religious observance';
    if(/festival|durbar|ofala|osun|argungu|new yam|mmanwu|igue|olojo|igbogo|calabar|nyalo|regatta|carnival/i.test(name)) return 'Nigerian cultural festival';
    if(/africa day/i.test(name)) return 'African Union observance';
    if(/valentine|father.s day|christmas eve|new year.s eve/i.test(name)) return 'Family / seasonal observance';
    if(/nigerian|nigeria|commonwealth day|day of the african child/i.test(name)) return 'Nigerian national observance';
    if(/world |international |international day|african child|migrant/i.test(name)) return 'International observance';
    return 'Community and cultural observance';
  };
  const presentationForEvent = event => {
    const name=String(event.name||'');
    const category=String(event.category||categoryForEvent(name));
    const c=category.toLowerCase();
    if(/holocaust|slave trade|cuito cuanavale|remembrance|memorial|genocide|armed forces.*remembrance/i.test(name)){
      return {tone:'remembrance',label:'REMEMBRANCE & TRIBUTE',upcoming:'REMEMBRANCE DAY',todayKicker:'REMEMBERING · HONOURING · REFLECTING',todayStatus:'DAY OF REMEMBRANCE',footer:'Remembering'};
    }
    if(/violence against women|trafficking|cancer|hiv|aids|tuberculosis|malaria|hepatitis|diabetes|health day|mental health|autism|disabilit|accessibility|racial discrimination|social justice|human rights|anti-corruption|press freedom|refugee|girl child|children.s day|no tobacco|zero waste|clean energy|water day|water safety|drowning prevention|environment|wildlife|forest|ozone|climate|safety and health|food security|nutrition|indigenous peoples|sign languages|tolerance|habitat|school feeding|population day|seas and oceans|migrants day|braille|peace|international day of democracy|african child|maritime|cities day|earth day|urban/i.test(name)){
      return {tone:'awareness',label:'AWARENESS & ADVOCACY',upcoming:'AWARENESS DAY',todayKicker:'AWARENESS IN ACTION · DIGNITY · SOLIDARITY',todayStatus:'AWARENESS DAY',footer:'Standing with'};
    }
    if(/ramadan|laylat al-qadr|arafah|ashura|mawlid|maulud|al-hijra|islamic new year|ash wednesday|palm sunday|maundy thursday|holy saturday|good friday|mothering sunday|isese day/i.test(name)){
      return {tone:'religious',label:'RELIGIOUS OBSERVANCE',upcoming:'RELIGIOUS OBSERVANCE',todayKicker:'A DAY OF FAITH · REFLECTION · PRAYER',todayStatus:'RELIGIOUS OBSERVANCE',footer:'Observing'};
    }
    if(/eid al-fitr|eid-el-fitr|eid al-adha|eid-el-kabir|christmas|easter sunday|easter monday/i.test(name)){
      return {tone:'religious-celebration',label:'RELIGIOUS CELEBRATION',upcoming:'RELIGIOUS CELEBRATION',todayKicker:'FAITH · HOPE · COMMUNITY',todayStatus:'RELIGIOUS CELEBRATION',footer:'Celebrating'};
    }
    if(/new year|valentine|boxing day|father.s day|international day of families|happiness/i.test(name)){
      return {tone:'celebration',label:'CELEBRATION & TOGETHERNESS',upcoming:'SPECIAL DAY',todayKicker:'TOGETHERNESS · JOY · KINDNESS',todayStatus:'TODAY IS THE DAY',footer:'Celebrating'};
    }
    if(/nigerian independence|independence day|democracy day|national police day|national youth day|nigerian army day|nigerian navy day|nigerian air force day|armed forces celebration/i.test(name)||c==='nigerian national observance'||c==='nigerian public holiday'){
      return {tone:'national',label:'NATIONAL DAY & COMMEMORATION',upcoming:'NATIONAL OBSERVANCE',todayKicker:'HONOURING OUR NATION · SERVICE · UNITY',todayStatus:'NATIONAL OBSERVANCE',footer:'Honouring'};
    }
    if(event.season||/festival|carnival|durbar|ofala|osun|argungu|new yam|mmanwu|igue|olojo|igbogo|nyalo|regatta|sango|boat show|beach festival|music festival|fashion festival/i.test(name)||/nigerian cultural festival|nigerian cultural event|nigerian tourism event/i.test(category)){
      return {tone:'festival',label:'CULTURAL FESTIVAL & HERITAGE',upcoming:'CULTURAL FESTIVAL',todayKicker:'CULTURE · HERITAGE · COMMUNITY',todayStatus:'FESTIVAL IN PROGRESS',footer:'Celebrating the heritage of'};
    }
    if(/workers|teachers|nurses|education|skills day|youth day|women.s day|men.s day|families|small and medium|small businesses|public service|volunteer|friendship|sport|poetry|art day|theatre|dance|language|literacy|books|science|telecommunication|statistics|industrialisation|africa day|african union|integration|commonwealth|traditional medicine|tourism|maritime|cultural diversity|mandela|human solidarity|united nations|international cooperation|african union|africa day|african public service|statistics|industrialisation|telecommunication|traditional medicine|sport|science|education|art day|theatre|dance|poetry|literacy|books|language|commonwealth|cultural diversity/i.test(name)||/african union observance|state-level observance|international observance/i.test(c)){
      return {tone:'recognition',label:'RECOGNITION & APPRECIATION',upcoming:'DAY OF RECOGNITION',todayKicker:'RECOGNISING CONTRIBUTION · SERVICE · IMPACT',todayStatus:'DAY OF RECOGNITION',footer:'Recognising'};
    }
    return {tone:'observance',label:'DAY OF OBSERVANCE',upcoming:'UPCOMING OBSERVANCE',todayKicker:'A DAY THAT MATTERS · LEARNING · CONNECTION',todayStatus:'OBSERVANCE TODAY',footer:'Observing'};
  };
  const localParts = date => {
    const p = Object.fromEntries(fmtParts.formatToParts(date).map(x => [x.type, x.value]));
    return {year:+p.year,month:+p.month,day:+p.day,hour:+p.hour,minute:+p.minute,second:+p.second};
  };
  const dateKey = (y,m,d) => String(y)+'-'+pad(m)+'-'+pad(d);
  // Nigeria uses UTC+1 throughout the year. Build event instants at local midnight.
  const lagosMidnight = (y,m,d) => new Date(Date.UTC(y,m-1,d)-hourMs);
  const addDaysUTC = (date,days) => {
    const copy = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+days));
    return {month:copy.getUTCMonth()+1,day:copy.getUTCDate()};
  };
  const nthWeekday = (year,month,weekday,nth) => {
    const first = new Date(Date.UTC(year,month-1,1)).getUTCDay();
    return 1+((weekday-first+7)%7)+(nth-1)*7;
  };
  const easterSunday = year => {
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
    const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
    const m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31);
    return {month,day:((h+l-7*m+114)%31)+1};
  };
  const hijriYearCache=new Map();
  const hijriDateInGregorianYear=(year,targetMonth,targetDay)=>{
    if(!hijriFormatter)return null;
    if(!hijriYearCache.has(year)){
      const found={};
      for(let month=1;month<=12;month++){
        const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
        for(let day=1;day<=daysInMonth;day++){
          const localNoon=new Date(Date.UTC(year,month-1,day,12,0,0));
          const p=Object.fromEntries(hijriFormatter.formatToParts(localNoon).map(part=>[part.type,part.value]));
          const key=Number(p.month)+'-'+Number(p.day);
          if(!found[key])found[key]={month,day};
        }
      }
      hijriYearCache.set(year,found);
    }
    return hijriYearCache.get(year)[targetMonth+'-'+targetDay]||null;
  };
  const eventsForYear = year => {
    const events=[];
    const add=(month,day,data)=>{
      const start=lagosMidnight(year,month,day);
      events.push({...data,category:data.category||categoryForEvent(data.name),scene:sceneForEvent(data.name).key,season:false,year,month,day,key:dateKey(year,month,day),start,end:new Date(start.getTime()+dayMs)});
    };
    // Date-window entries are used only when a cultural programme is announced
    // by month/season rather than by a fixed Gregorian day. The display labels
    // them as a period and never pretends the first day is the festival date.
    const addSeason=(startMonth,startDay,endMonth,endDay,data)=>{
      const start=lagosMidnight(year,startMonth,startDay);
      const end=lagosMidnight(year,endMonth,endDay+1);
      events.push({...data,category:data.category||'Nigerian cultural festival',scene:sceneForEvent(data.name).key,season:true,year,month:startMonth,day:startDay,key:dateKey(year,startMonth,startDay),start,end});
    };
    const fixed=[
      [1,1,'New Year’s Day '+year,'🎆','A fresh year, new ideas and new possibilities.','HAPPY NEW YEAR '+year+'!','#e8bf61','#8f43da','New year'],
      [2,14,'Valentine’s Day','❤️','Celebrate kindness, friendship and the people who make life brighter.','HAPPY VALENTINE’S DAY!','#ff668b','#9f245e','Love and kindness'],
      [5,1,'Workers’ Day','🦺','Honouring workers and the contribution of work to our communities.','HAPPY WORKERS’ DAY!','#f0bd54','#a54a20','Honouring workers'],
      [12,25,'Christmas Day','🎄','Wishing everyone peace, love, generosity and a joyful Christmas season.','MERRY CHRISTMAS!','#58d58a','#c53c53','Season of giving'],
      [12,26,'Boxing Day','🎁','A day for generosity, gratitude, rest and time with loved ones.','HAPPY BOXING DAY!','#e9c46a','#b33a55','Share the joy']
    ];
    fixed.forEach(([m,d,name,emoji,description,greeting,accent,secondary,label])=>add(m,d,{name,emoji,description,greeting,accent,secondary,label}));
    // Nigeria-wide and internationally recognised annual observances.
    const annualObservances=[
      [1,4,'World Braille Day','⠿','Recognising the importance of Braille for communication, education and inclusion.','WORLD BRAILLE DAY!','#9bd7c4','#245b79','Inclusion'],
      [1,15,'Armed Forces Celebration and Remembrance Day (Nigeria)','🎖️','Honouring serving members of the Nigerian Armed Forces and remembering personnel who died in service.','WE HONOUR OUR ARMED FORCES!','#b9c9d7','#24435b','Armed Forces'],
      [1,24,'International Day of Education','🎓','Celebrating education as a foundation for opportunity, dignity and lifelong learning.','HAPPY INTERNATIONAL DAY OF EDUCATION!','#e8c66d','#614a9d','Education'],
      [1,26,'International Day of Clean Energy','⚡','Promoting access to reliable, sustainable and modern energy.','CLEAN ENERGY, BRIGHTER FUTURE!','#f0d16e','#398b9a','Clean energy'],
      [1,27,'International Holocaust Remembrance Day','🕯️','Remembering victims of the Holocaust and renewing the commitment to dignity and human rights.','A DAY OF REMEMBRANCE!','#b8c2d8','#343c59','Remembrance'],
      [1,30,'World Neglected Tropical Diseases Day','🌍','Raising awareness and supporting action against neglected tropical diseases.','WORLD NTD DAY!','#78c9ac','#276b70','Health'],
      [2,4,'World Cancer Day','🎗️','Standing together to raise awareness, support prevention and encourage access to cancer care.','WORLD CANCER DAY!','#e9b5c7','#873e78','Cancer awareness'],
      [2,11,'International Day of Women and Girls in Science','🔬','Celebrating women and girls in science, technology, engineering and mathematics.','WOMEN AND GIRLS IN SCIENCE!','#d59be8','#65439c','Science'],
      [2,20,'World Day of Social Justice','⚖️','Promoting fairness, equal opportunity and dignity for all.','WORLD DAY OF SOCIAL JUSTICE!','#e0c079','#3d6e83','Justice'],
      [2,21,'International Mother Language Day','🗣️','Celebrating linguistic and cultural diversity, including Nigeria’s many languages.','CELEBRATE EVERY LANGUAGE!','#e9c078','#6d4f9d','Languages'],
      [3,3,'World Wildlife Day','🦋','Celebrating wild animals and plants and the importance of protecting biodiversity.','WORLD WILDLIFE DAY!','#76c78c','#286c57','Wildlife'],
      [3,21,'International Day for the Elimination of Racial Discrimination','🤝','Promoting equality, respect and freedom from racial discrimination.','STAND FOR EQUALITY!','#d9ad75','#754d88','Equality'],
      [3,21,'International Day of Forests','🌳','Celebrating forests and the role they play in healthy communities and ecosystems.','PROTECT OUR FORESTS!','#68c68b','#21694d','Forests'],
      [3,21,'World Poetry Day','✍️','Celebrating poetry, language, creativity and the power of words.','HAPPY WORLD POETRY DAY!','#c7a5e8','#624b9c','Poetry'],
      [3,23,'World Meteorological Day','🌤️','Recognising the importance of weather, climate and water services.','WORLD METEOROLOGICAL DAY!','#92cbea','#3b679e','Weather and climate'],
      [3,24,'World Tuberculosis Day','🩺','Supporting awareness, prevention, testing and treatment for tuberculosis.','WORLD TB DAY!','#77c5b4','#356e82','TB awareness'],
      [3,27,'World Theatre Day','🎭','Celebrating theatre artists, performers and the stories that bring communities together.','WORLD THEATRE DAY!','#dc9b70','#873f73','Theatre'],
      [3,30,'International Day of Zero Waste','♻️','Encouraging responsible consumption, reuse and waste reduction.','MAKE ZERO WASTE A HABIT!','#73c98f','#276e64','Zero waste'],
      [4,2,'World Autism Awareness Day','🧩','Promoting acceptance, inclusion and respect for autistic people and their families.','WORLD AUTISM AWARENESS DAY!','#80c9dc','#4b5e9e','Inclusion'],
      [4,15,'World Art Day','🎨','Celebrating artists, creativity and the role of art in society.','HAPPY WORLD ART DAY!','#d78ad5','#67438e','Art'],
      [4,18,'Nigerian Air Force Day','✈️','Honouring the service and contribution of the Nigerian Air Force.','SALUTE TO THE NIGERIAN AIR FORCE!','#a9c9df','#345b80','Air Force'],
      [4,23,'World Book and Copyright Day','📚','Celebrating books, reading, authors and the value of creativity and copyright.','CELEBRATE BOOKS AND IDEAS!','#e0bd70','#59458e','Books'],
      [4,25,'World Malaria Day','🦟','Supporting malaria prevention, awareness, testing and treatment.','WORLD MALARIA DAY!','#8acb9d','#326b62','Malaria awareness'],
      [4,28,'World Day for Safety and Health at Work','🦺','Promoting safe, healthy and dignified workplaces for everyone.','SAFER WORKPLACES FOR ALL!','#edc36e','#536e92','Workplace safety'],
      [4,29,'International Dance Day','💃','Celebrating dance as an art, a cultural expression and a shared language.','HAPPY INTERNATIONAL DANCE DAY!','#e99ac4','#75418f','Dance'],
      [5,3,'World Press Freedom Day','📰','Recognising the importance of a free, independent and responsible press.','WORLD PRESS FREEDOM DAY!','#8fc9e4','#485c91','Press freedom'],
      [5,12,'International Nurses Day','🩺','Thanking nurses for their skill, care and vital contribution to health.','THANK YOU, NURSES!','#82d0bd','#276c78','Nurses'],
      [5,15,'International Day of Families','👨‍👩‍👧‍👦','Celebrating families and the care, support and belonging they provide.','HAPPY INTERNATIONAL DAY OF FAMILIES!','#efb3c8','#854c83','Families'],
      [5,17,'World Telecommunication and Information Society Day','📡','Highlighting how digital connectivity and information technology can improve lives.','CONNECTING THE WORLD!','#8dc4eb','#5e429b','Connectivity'],
      [5,21,'World Day for Cultural Diversity','🌍','Celebrating cultural diversity, dialogue and mutual understanding.','CELEBRATE OUR DIVERSITY!','#d6b278','#81518c','Culture'],
      [5,25,'Africa Day','🌍','Celebrating African unity, heritage, creativity and shared progress.','HAPPY AFRICA DAY!','#55be86','#18794e','Africa'],
      [5,31,'World No Tobacco Day','🚭','Encouraging healthier lives and action to reduce tobacco-related harm.','WORLD NO TOBACCO DAY!','#7dceaa','#376d65','Healthy living'],
      [6,1,'Nigerian Navy Day','⚓','Honouring the service and contribution of the Nigerian Navy.','SALUTE TO THE NIGERIAN NAVY!','#83c8e8','#1c567b','Navy'],
      [6,14,'World Blood Donor Day','🩸','Thanking voluntary blood donors and encouraging safe blood donation.','THANK YOU, BLOOD DONORS!','#ef8297','#a33558','Blood donors'],
      [6,16,'Day of the African Child','🧒🏾','Promoting the rights, protection, education and wellbeing of African children.','DAY OF THE AFRICAN CHILD!','#efc36a','#4d8c8b','African children'],
      [6,20,'African Refugee Day / World Refugee Day','🕊️','Standing with refugees and recognising their courage, rights and resilience.','STAND WITH REFUGEES!','#9cc9e2','#4c638f','Refugees'],
      [6,23,'United Nations Public Service Day','🏛️','Recognising public service and the people who serve their communities.','PUBLIC SERVICE DAY!','#8ab8db','#4a548b','Public service'],
      [6,27,'World Micro, Small and Medium-sized Enterprises Day','🏪','Celebrating small businesses and entrepreneurs who create jobs and opportunity.','CELEBRATE SMALL BUSINESSES!','#e3bb70','#684a94','Small business'],
      [7,6,'Nigerian Army Day','🎖️','Honouring the service and contribution of the Nigerian Army.','SALUTE TO THE NIGERIAN ARMY!','#b7c69d','#4a654f','Army'],
      [7,11,'World Population Day','🌍','Encouraging informed dialogue about population, development and human wellbeing.','WORLD POPULATION DAY!','#91c4dd','#4a5e9d','Population'],
      [7,18,'Nelson Mandela International Day','🤝','Inspiring service, compassion and practical action for a better world.','MANDELA DAY! TAKE ACTION!','#d3ad75','#5b518c','Service'],
      [7,25,'World Drowning Prevention Day','🌊','Promoting water safety and action to prevent drowning.','WATER SAFETY SAVES LIVES!','#71c9e6','#265f9a','Water safety'],
      [7,28,'World Hepatitis Day','🩺','Raising awareness of viral hepatitis prevention, testing and treatment.','WORLD HEPATITIS DAY!','#77c5b4','#356e82','Hepatitis'],
      [7,30,'International Day of Friendship','🫶','Celebrating friendship, kindness and understanding across communities.','HAPPY INTERNATIONAL DAY OF FRIENDSHIP!','#edb6c7','#8a538c','Friendship'],
      [7,30,'World Day Against Trafficking in Persons','🕊️','Standing against human trafficking and supporting the dignity and safety of all people.','STAND AGAINST HUMAN TRAFFICKING!','#a7c5db','#57518b','Human dignity'],
      [8,9,'International Day of the World’s Indigenous Peoples','🌿','Recognising the cultures, knowledge and rights of Indigenous peoples.','CELEBRATE INDIGENOUS CULTURES!','#85c39b','#436d67','Indigenous peoples'],
      [8,19,'World Humanitarian Day','🤲','Recognising humanitarian workers and everyone supporting people in crisis.','HONOUR HUMANITARIAN SERVICE!','#e5c17a','#4e6f89','Humanitarian service'],
      [8,23,'International Day for the Remembrance of the Slave Trade and its Abolition','🕊️','Remembering the history of the transatlantic slave trade and honouring the dignity and freedom of all people.','REMEMBERING · LEARNING · HONOURING FREEDOM!','#b8a0c7','#4c3a63','Remembrance'],
      [9,8,'International Literacy Day','📖','Celebrating literacy and the power of reading and learning for all.','HAPPY INTERNATIONAL LITERACY DAY!','#e2bf6e','#564a91','Literacy'],
      [9,15,'International Day of Democracy','🗳️','Promoting participation, accountability and democratic values.','INTERNATIONAL DAY OF DEMOCRACY!','#86c7a3','#3a6984','Democracy'],
      [9,16,'World Ozone Day','🌎','Supporting action to protect the ozone layer and our shared environment.','WORLD OZONE DAY!','#75c5a1','#3d7b78','Ozone protection'],
      [9,23,'International Day of Sign Languages','🤟','Celebrating sign languages and the rights and inclusion of Deaf communities.','CELEBRATE SIGN LANGUAGES!','#9ac6df','#4f5e99','Sign languages'],
      [9,27,'World Tourism Day','🧳','Celebrating travel, culture and responsible tourism across Nigeria and the world.','HAPPY WORLD TOURISM DAY!','#edc475','#4f7890','Tourism'],
      [10,10,'World Mental Health Day','💚','Encouraging understanding, compassion and access to mental health support.','WORLD MENTAL HEALTH DAY!','#78c9a6','#3e6a8c','Mental wellbeing'],
      [10,11,'International Day of the Girl Child','👧🏾','Celebrating girls and advocating for their rights, education and opportunities.','CELEBRATE EVERY GIRL!','#e8a9cc','#8a4c91','Girls'],
      [10,16,'World Food Day','🌾','Promoting food security, nutrition and sustainable food systems.','WORLD FOOD DAY!','#d9bc70','#52865b','Food security'],
      [10,24,'United Nations Day','🌐','Recognising international cooperation and the work of the United Nations.','UNITED NATIONS DAY!','#78b8df','#405b98','International cooperation'],
      [10,31,'World Cities Day','🏙️','Promoting safer, more inclusive and sustainable cities.','WORLD CITIES DAY!','#9ab2d7','#4a5189','Sustainable cities'],
      [11,10,'World Science Day for Peace and Development','🔬','Celebrating science and its contribution to peace and sustainable development.','WORLD SCIENCE DAY!','#9cafe4','#5b4b97','Science'],
      [11,14,'World Diabetes Day','🩺','Raising awareness of diabetes prevention, care and support.','WORLD DIABETES DAY!','#87c6bd','#386c88','Diabetes'],
      [11,16,'International Day for Tolerance','🤝','Promoting respect, understanding and peaceful coexistence.','CHOOSE RESPECT AND TOLERANCE!','#e6c17c','#6a548f','Tolerance'],
      [11,19,'International Men’s Day','👨🏾','Recognising positive contributions of men and boys and promoting wellbeing.','INTERNATIONAL MEN’S DAY!','#8dbce1','#475a92','Men'],
      [11,20,'World Children’s Day','🧒🏾','Promoting children’s rights, safety, education and participation.','WORLD CHILDREN’S DAY!','#e8c56c','#4e94b3','Children'],
      [11,25,'International Day for the Elimination of Violence against Women','🧡','Supporting safety, dignity and freedom from violence for women and girls.','ORANGE THE WORLD · END VIOLENCE!','#efaa75','#a44d67','Women’s safety'],
      [12,1,'World AIDS Day','❤️','Remembering those affected by HIV and supporting prevention, treatment and solidarity.','WORLD AIDS DAY!','#e57c94','#94435c','Health and solidarity'],
      [12,3,'International Day of Persons with Disabilities','♿','Promoting accessibility, inclusion and equal participation for persons with disabilities.','INCLUSION FOR EVERYONE!','#8bc5dc','#4c5896','Accessibility'],
      [12,5,'International Volunteer Day','🤲','Thanking volunteers who give time and skills to support communities.','THANK YOU, VOLUNTEERS!','#e0bc72','#5c6f8a','Volunteers'],
      [12,9,'International Anti-Corruption Day','⚖️','Promoting integrity, transparency and accountability.','CHOOSE INTEGRITY!','#8ac7a4','#416b69','Integrity'],
      [12,10,'Human Rights Day','⚖️','Standing for dignity, equality, freedom and the rights of every person.','HUMAN RIGHTS DAY!','#73c5e7','#6b4eb5','Dignity and equality'],
      [12,18,'International Migrants Day','🌍','Recognising the contributions, rights and dignity of migrants and their families.','INTERNATIONAL MIGRANTS DAY!','#9ac6dd','#53658c','Migration'],
      [12,20,'International Human Solidarity Day','🤝','Promoting unity, cooperation and solidarity among people and nations.','TOGETHER IN SOLIDARITY!','#d7b16d','#62518d','Solidarity'],
      [12,24,'Christmas Eve','🕯️','A joyful Christmas Eve of reflection, family and anticipation.','WISHING YOU A PEACEFUL CHRISTMAS EVE!','#e6c16d','#8d4660','Christmas Eve'],
      [12,31,'New Year’s Eve','🎇','Celebrating the year’s journey and welcoming a new beginning.','HAPPY NEW YEAR’S EVE!','#e8bf61','#8f43da','New Year’s Eve']
    ];
    // Restore core annual dates that were previously removed as apparent duplicates.
    annualObservances.push(
      [3,8,'International Women’s Day','👩🏽','Recognising the achievements, leadership, rights and contributions of women and girls.','HAPPY INTERNATIONAL WOMEN’S DAY!','#c18be0','#70428f','Women’s Day'],
      [3,20,'International Day of Happiness','😊','Promoting wellbeing, kindness and the importance of happiness in our communities.','HAPPY INTERNATIONAL DAY OF HAPPINESS!','#f5d56d','#35a98b','Happiness'],
      [3,22,'World Water Day','💧','Raising awareness of the importance of freshwater and advocating for sustainable water management.','WORLD WATER DAY · EVERY DROP MATTERS!','#55c6f4','#1764b4','Water'],
      [4,7,'World Health Day','🩺','Drawing attention to a priority health issue and supporting healthier communities for everyone.','WORLD HEALTH DAY!','#55c78b','#2675a5','Health'],
      [4,22,'Earth Day','🌎','Mobilising care and action to protect the planet and its natural systems.','EARTH DAY · ACT FOR OUR PLANET!','#5ecb83','#2875ad','Planet'],
      [5,27,'Children’s Day (Nigeria)','🧒🏾','Recognising Nigerian children, their rights, safety, education and opportunities to thrive.','HAPPY CHILDREN’S DAY!','#ffd56b','#4d9bd4','Children'],
      [6,5,'World Environment Day','🌱','Encouraging action to protect the environment and build a cleaner, healthier future.','WORLD ENVIRONMENT DAY · ACT FOR NATURE!','#68d18a','#218b68','Environment'],
      [6,12,'Democracy Day (Nigeria)','🇳🇬','Recognising democracy, civic participation and the people who shape Nigeria’s future.','HAPPY DEMOCRACY DAY!','#61c986','#238d57','Democracy'],
      [7,15,'World Youth Skills Day','🚀','Highlighting the importance of equipping young people with skills for work, enterprise and life.','WORLD YOUTH SKILLS DAY!','#e8bb64','#7b43c7','Youth skills'],
      [8,12,'International Youth Day','🌟','Recognising young people’s contributions and the importance of their participation in society.','HAPPY INTERNATIONAL YOUTH DAY!','#e8c35e','#7950dc','Youth'],
      [9,21,'International Day of Peace','🕊️','Promoting peace, non-violence, understanding and cooperation across communities.','INTERNATIONAL DAY OF PEACE!','#9bd9ef','#4b88c9','Peace'],
      [10,1,'Nigeria Independence Day','🇳🇬','Commemorating Nigeria’s independence and recognising the country’s people, history and aspirations.','HAPPY INDEPENDENCE DAY, NIGERIA!','#67d28c','#16834e','Independence'],
      [10,5,'World Teachers’ Day','📚','Recognising teachers and the essential role of educators in shaping futures.','WORLD TEACHERS’ DAY · THANK YOU, EDUCATORS!','#e9c66a','#6d48b6','Teachers']
    );
    annualObservances.forEach(([m,d,name,emoji,description,greeting,accent,secondary,label])=>
      add(m,d,{name,emoji,description,greeting,accent,secondary,label,category:categoryForEvent(name)})
    );
    const NigeriaAndAfricanObservances=[
      [1,31,'African Day of Peace and Reconciliation','🕊️','Promoting dialogue, peacebuilding and reconciliation across Africa.','AFRICAN DAY OF PEACE & RECONCILIATION!','#a8c9e5','#426a9a','Peace in Africa'],
      [3,1,'African Day of School Feeding','🍲','Highlighting school meals as a support for children’s nutrition, health and education across Africa.','AFRICAN DAY OF SCHOOL FEEDING!','#e5c376','#5a8b63','School feeding'],
      [3,3,'Africa Environment and Wangari Maathai Day','🌳','Celebrating environmental leadership, tree planting and care for Africa’s natural heritage.','AFRICA ENVIRONMENT DAY!','#78c98c','#296d55','African environment'],
      [4,7,'National Police Day (Nigeria)','👮🏾','Honouring Nigeria Police Force personnel and remembering officers who died in service.','HAPPY NATIONAL POLICE DAY!','#8bb9df','#334c80','National Police Day'],
      [4,7,'African Union Day of Remembrance of the 1994 Genocide Against the Tutsi','🕯️','Remembering victims of the 1994 Genocide Against the Tutsi in Rwanda and honouring survivors.','A DAY OF REMEMBRANCE AND REFLECTION!','#b7a8c8','#473c62','Remembrance'],
      [4,23,'Day of the Battle of Cuito Cuanavale','🕊️','Remembering a pivotal moment in the history of southern Africa and its liberation struggles.','AFRICAN HISTORY & REMEMBRANCE!','#c6b08b','#65517b','African history'],
      [6,7,'Africa Border Day','🌍','Promoting cooperation, peace and development across Africa’s borders.','AFRICA BORDER DAY!','#8bbbd6','#476b8a','Border cooperation'],
      [6,23,'African Public Service Day','🏛️','Recognising public servants and the role of effective public institutions in Africa.','AFRICAN PUBLIC SERVICE DAY!','#88b7db','#48548a','Public service'],
      [6,30,'Day of Africa’s Scientific Renaissance','🔬','Celebrating African science, research, invention and innovation.','AFRICA SCIENTIFIC RENAISSANCE!','#9ac4e2','#51488f','Science and innovation'],
      [7,7,'African Integration Day','🤝','Celebrating unity, regional cooperation and integration across Africa.','AFRICAN INTEGRATION DAY!','#e0be76','#566b89','African unity'],
      [7,11,'African Anti-Corruption Day','⚖️','Promoting transparency, accountability and integrity across African institutions.','AFRICAN ANTI-CORRUPTION DAY!','#8ac7a4','#416b69','Integrity'],
      [7,25,'Africa Day of Seas and Oceans','🌊','Encouraging the protection and sustainable use of Africa’s seas and oceans.','PROTECT AFRICA’S SEAS AND OCEANS!','#74c7df','#285f8b','Seas and oceans'],
      [7,31,'Africa’s Women Day','💜','Celebrating African women’s achievements, leadership and contributions.','HAPPY AFRICA’S WOMEN DAY!','#c18be0','#70428f','African women'],
      [8,10,'Africa Day of Decentralisation and Local Development','🏘️','Promoting effective local governance and community-led development across Africa.','LOCAL DEVELOPMENT, SHARED PROGRESS!','#d9bd7e','#5c7088','Local development'],
      [8,10,'Africa Civil Registration and Vital Statistics Day','📋','Promoting reliable civil registration and vital statistics systems across Africa.','AFRICA CIVIL REGISTRATION DAY!','#8fb9da','#4b5b8f','Civil registration'],
      [8,31,'African Traditional Medicine Day','🌿','Recognising traditional medicine heritage and encouraging safe, evidence-informed health practice.','AFRICAN TRADITIONAL MEDICINE DAY!','#82c39c','#386b5a','Traditional medicine'],
      [9,9,'African Union Day','🌍','Celebrating African unity, cooperation and the institutions of the African Union.','HAPPY AFRICAN UNION DAY!','#e1c078','#526b8a','African Union'],
      [10,21,'Africa Human Rights Day','⚖️','Promoting human dignity, justice and the protection of human rights across Africa.','AFRICA HUMAN RIGHTS DAY!','#8ebdde','#53558e','Human rights'],
      [10,30,'Africa Food Security and Nutrition Day','🌾','Advancing food security, nutrition and resilient food systems across Africa.','AFRICA FOOD SECURITY & NUTRITION DAY!','#d6bc78','#55865b','Food security'],
      [11,1,'National Youth Day (Nigeria)','🚀','Celebrating Nigerian young people and promoting youth participation, opportunity and development.','HAPPY NATIONAL YOUTH DAY!','#e8c35e','#7950dc','Nigerian youth'],
      [11,1,'Africa Youth Day','🌍','Amplifying the voices of African youth and recognising young people as agents of change.','HAPPY AFRICA YOUTH DAY!','#e8c35e','#4b6a9c','African youth'],
      [11,18,'African Statistics Day','📊','Highlighting quality statistics and data for planning and development in Africa.','AFRICAN STATISTICS DAY!','#9cbbe1','#4a568a','African statistics'],
      [11,20,'Africa Industrialisation Day','🏭','Promoting industrial development, innovation, productive capacity and jobs across Africa.','AFRICA INDUSTRIALISATION DAY!','#d8b879','#655282','Industry'],
      [12,7,'Africa Telecommunications and ICT Day','📡','Celebrating communication networks and digital inclusion across Africa.','AFRICA TELECOMMUNICATIONS & ICT DAY!','#89c6df','#52458b','Digital Africa'],
      [12,14,'Day of African Sport','🏅','Celebrating sport, physical activity and African sporting talent.','HAPPY DAY OF AFRICAN SPORT!','#e4c06f','#5a528c','African sport']
    ];
    NigeriaAndAfricanObservances.forEach(([m,d,name,emoji,description,greeting,accent,secondary,label])=>
      add(m,d,{name,emoji,description,greeting,accent,secondary,label,category:categoryForEvent(name)})
    );
    // Easter dates are calculated for each Gregorian year.
    const easter=easterSunday(year);
    const ashWednesday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),-46);
    const palmSunday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),-7);
    const maundyThursday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),-3);
    const holySaturday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),-1);
    add(ashWednesday.month,ashWednesday.day,{name:'Ash Wednesday',emoji:'✝️',description:'A Christian day of reflection marking the beginning of Lent.',greeting:'A BLESSED ASH WEDNESDAY!',accent:'#b7a5d0',secondary:'#514267',label:'Lent',category:'Christian observance'});
    add(palmSunday.month,palmSunday.day,{name:'Palm Sunday',emoji:'🌿',description:'Remembering the Christian observance of Jesus’ entry into Jerusalem.',greeting:'A BLESSED PALM SUNDAY!',accent:'#9ac69d',secondary:'#456c5d',label:'Palm Sunday',category:'Christian observance'});
    add(maundyThursday.month,maundyThursday.day,{name:'Maundy Thursday',emoji:'🕯️',description:'A Christian day of remembrance, reflection and service.',greeting:'A BLESSED MAUNDY THURSDAY!',accent:'#c9b8dd',secondary:'#65517f',label:'Maundy Thursday',category:'Christian observance'});
    add(holySaturday.month,holySaturday.day,{name:'Holy Saturday',emoji:'🕊️',description:'A quiet Christian day of reflection between Good Friday and Easter Sunday.',greeting:'A PEACEFUL HOLY SATURDAY!',accent:'#b4c8d9',secondary:'#495a77',label:'Holy Saturday',category:'Christian observance'});
    // Commonwealth Day is the second Monday in March; World Habitat Day is
    // the first Monday in October; World Maritime Day is the last Thursday
    // in September. These are rules, not hard-coded weekday/date pairs.
    add(3,nthWeekday(year,3,1,2),{name:'Commonwealth Day',emoji:'🌐',description:'Recognising the Commonwealth’s people, shared values and cooperation.',greeting:'HAPPY COMMONWEALTH DAY!',accent:'#9cc5dc',secondary:'#52609a',label:'Commonwealth'});
    add(10,nthWeekday(year,10,1,1),{name:'World Habitat Day',emoji:'🏘️',description:'Encouraging inclusive, safe and sustainable human settlements.',greeting:'WORLD HABITAT DAY!',accent:'#b0c5dc',secondary:'#58638f',label:'Sustainable homes'});
    const lastWeekday=(month,weekday)=>{
      const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
      const lastDow=new Date(Date.UTC(year,month-1,lastDay)).getUTCDay();
      return lastDay-((lastDow-weekday+7)%7);
    };
    add(9,lastWeekday(9,4),{name:'World Maritime Day',emoji:'⚓',description:'Recognising the importance of maritime safety, shipping and the marine environment.',greeting:'WORLD MARITIME DAY!',accent:'#78c7dc',secondary:'#31577e',label:'Maritime'});
    // Eyo Festival (Lagos) is staged when an important indigene dies; Ovie Orese (Ogori) is a community rite. Neither has a reliable fixed annual Gregorian date. Do not invent a recurring countdown date; activate only after a confirmed local notice.
    // Annual cultural festival periods. These are intentionally presented as
    // month/season windows where the organisers do not publish one permanent
    // Gregorian date. Exact editions are added once announced by organisers.
    addSeason(2,1,3,31,{name:'Argungu International Fishing and Cultural Festival',emoji:'🐟',description:'A celebrated Kebbi cultural gathering featuring traditional fishing, canoe races, water competitions, wrestling and community heritage.',greeting:'ARGUNGU FESTIVAL SEASON!',accent:'#68c9d7',secondary:'#1e6178',label:'Argungu Festival',dateLabel:'Usually February–March · annual dates announced by organisers',category:'Nigerian cultural festival',tentative:true});
    addSeason(7,1,7,31,{name:'Tour Nigeria Brand Launch',emoji:'🚌',description:'A Nigerian Tourism Development Authority programme promoting domestic tourism, local destinations and Made-in-Nigeria experiences.',greeting:'EXPLORE NIGERIA!',accent:'#e9c36e',secondary:'#397b87',label:'Tour Nigeria',dateLabel:'July · organiser programme dates vary',category:'Nigerian tourism event'});
    addSeason(7,1,7,31,{name:'Bus Tour Nigeria',emoji:'🚌',description:'A nationwide travel season showcasing destinations and attractions across Nigeria’s states.',greeting:'DISCOVER NIGERIA!',accent:'#78c9db',secondary:'#315f87',label:'Bus Tour Nigeria',dateLabel:'July · tour dates and routes announced by organisers',category:'Nigerian tourism event',tentative:true});
    addSeason(8,1,8,7,{name:'Igbo New Yam Festival Season (Iwa Ji / Iri Ji)',emoji:'🌾',description:'Celebrating the new yam harvest and the food, gratitude and community traditions of Igbo communities.',greeting:'HAPPY NEW YAM FESTIVAL SEASON!',accent:'#d8b86e',secondary:'#6c8a48',label:'New Yam Festival',dateLabel:'Early August · local community dates vary',category:'Nigerian cultural festival',tentative:true});
    add(8,20,{name:'Isese Day (Yoruba traditional heritage · participating South-West states)',emoji:'🪘',description:'A day celebrating Yoruba indigenous religion, traditional heritage and cultural identity. Some South-West state governments declare a local work-free day; it is not a nationwide federal public holiday.',greeting:'HAPPY ISESE DAY!',accent:'#d7a56c',secondary:'#71478e',label:'Isese Day',category:'State-level observance · participating South-West states',dateNote:'State-level observance; check each participating state’s annual notice'});
    addSeason(8,8,8,21,{name:'Osun-Osogbo Festival',emoji:'🌊',description:'A two-week cultural and spiritual festival in Osogbo, Osun State, with a programme of traditional rites and community gatherings.',greeting:'OSUN-OSOGBO FESTIVAL!',accent:'#6cc3aa',secondary:'#276c72',label:'Osun-Osogbo',dateLabel:'Second week of August · annual programme dates announced locally',category:'Nigerian cultural festival',tentative:true});
    addSeason(8,1,8,31,{name:'Sango Festival Season (Oyo)',emoji:'⚡',description:'A Yoruba cultural festival honouring the heritage, history, music and traditions associated with Sango in Oyo.',greeting:'SANGO FESTIVAL SEASON!',accent:'#e49d5b',secondary:'#913c3d',label:'Sango Festival',dateLabel:'August · local programme dates vary',category:'Nigerian cultural festival',tentative:true});
    addSeason(9,1,9,7,{name:'Ige-Agba Festival (Igede, Benue)',emoji:'🌾',description:'An Igede cultural and new-yam celebration held in the Oju and Obi communities of Benue State.',greeting:'IGE-AGBA FESTIVAL!',accent:'#d6b86d',secondary:'#65834b',label:'Ige-Agba',dateLabel:'First week of September · local programme dates vary',category:'Nigerian cultural festival',tentative:true});
    addSeason(9,1,9,30,{name:'Igbogo Festival (Owo)',emoji:'🎭',description:'An annual cultural celebration in Owo, Ondo State, associated with the new-yam season and local pageantry.',greeting:'IGBOGO FESTIVAL SEASON!',accent:'#d8a76c',secondary:'#75508c',label:'Igbogo Festival',dateLabel:'September · local programme dates vary',category:'Nigerian cultural festival',tentative:true});
    addSeason(9,1,9,30,{name:'Nigerian Fashion Festival Season',emoji:'👗',description:'Celebrating Nigerian designers, fashion creativity, craftsmanship and the growing fashion industry.',greeting:'NIGERIAN FASHION FESTIVAL!',accent:'#e8a3c8',secondary:'#794a97',label:'Fashion Festival',dateLabel:'September · programme dates announced by organisers',category:'Nigerian cultural event',tentative:true});
    addSeason(10,1,10,31,{name:'Olojo Festival (Ile-Ife)',emoji:'👑',description:'An annual cultural and spiritual festival in Ile-Ife celebrating heritage and the traditions of Oke Mogun.',greeting:'OLOJO FESTIVAL SEASON!',accent:'#d9b46f',secondary:'#79513e',label:'Olojo Festival',dateLabel:'October · multi-day programme; exact dates announced locally',category:'Nigerian cultural festival',tentative:true});
    addSeason(10,1,10,17,{name:'Ofala Festival (Onitsha)',emoji:'👑',description:'A major Onitsha royal and cultural celebration marking the Obi’s emergence from seclusion, with ceremonies, homage, parades and performances.',greeting:'OFALA FESTIVAL SEASON!',accent:'#e3bd71',secondary:'#64449c',label:'Ofala Festival',dateLabel:'Early–mid October · annual dates announced by the Onitsha palace',category:'Nigerian cultural festival',tentative:true});
    addSeason(10,1,10,31,{name:'Flavours of Nigeria Festival',emoji:'🍲',description:'A celebration of Nigerian cuisine and culinary traditions from communities across the 36 states.',greeting:'TASTE THE FLAVOURS OF NIGERIA!',accent:'#e7ad62',secondary:'#9b573c',label:'Flavours of Nigeria',dateLabel:'October · programme dates announced by organisers',category:'Nigerian cultural event',tentative:true});
    addSeason(10,1,10,31,{name:'Nigeria Boat Show and Regatta Season',emoji:'⛵',description:'Celebrating Nigeria’s waterways, boat culture, maritime enterprise and water sports.',greeting:'NIGERIA BOAT SHOW & REGATTA!',accent:'#74c8dc',secondary:'#315f87',label:'Boat Show / Regatta',dateLabel:'October · event dates and venue announced by organisers',category:'Nigerian cultural event',tentative:true});
    addSeason(11,1,11,30,{name:'Mmanwu Masquerade Festival (Enugu)',emoji:'🎭',description:'A colourful Enugu cultural season featuring masquerade traditions, music, dance and community heritage.',greeting:'MMANWU FESTIVAL SEASON!',accent:'#d6a46c',secondary:'#70408b',label:'Mmanwu Festival',dateLabel:'November · local festival dates vary',category:'Nigerian cultural festival',tentative:true});
    addSeason(11,1,11,30,{name:'Nyalo Nyalo Cultural Carnival (Abuja)',emoji:'🎉',description:'A city-wide cultural carnival celebrating the traditions and diverse cultural expressions of Abuja and Nigeria.',greeting:'NYALO NYALO CULTURAL CARNIVAL!',accent:'#dba36f',secondary:'#75498e',label:'Nyalo Nyalo',dateLabel:'November · programme dates announced by organisers',category:'Nigerian cultural event',tentative:true});
    addSeason(11,1,11,30,{name:'Nigeria Beach Festival Season',emoji:'🏖️',description:'A coastal celebration of culture, sport, music, recreation and family activities across participating Nigerian states.',greeting:'NIGERIA BEACH FESTIVAL!',accent:'#75c9df',secondary:'#285f8a',label:'Beach Festival',dateLabel:'November · event dates and participating locations vary',category:'Nigerian cultural event',tentative:true});
    if(year===2026){
      add(12,18,{name:'Igue Festival (Benin City)',emoji:'👑',description:'The Edo Igue Festival at the Oba’s Palace in Benin City, celebrating Edo royal heritage and tradition.',greeting:'IGUE FESTIVAL!',accent:'#d8b56c',secondary:'#65449a',label:'Igue Festival',category:'Nigerian cultural festival'});
      add(12,26,{name:'Calabar Cultural Carnival',emoji:'🎭',description:'The opening cultural parade of the Calabar Festival season in Cross River State.',greeting:'CALABAR CULTURAL CARNIVAL!',accent:'#e8b86b',secondary:'#953c78',label:'Calabar Cultural Carnival',category:'Nigerian cultural festival'});
      add(12,27,{name:'Calabar Junior Carnival',emoji:'🎈',description:'A colourful children and youth carnival in the Calabar Festival programme.',greeting:'CALABAR JUNIOR CARNIVAL!',accent:'#f0bd71',secondary:'#7e4ca6',label:'Junior Carnival',category:'Nigerian cultural festival'});
      add(12,28,{name:'Carnival Calabar · Parade of the Bands',emoji:'🎊',description:'Calabar’s signature parade celebrating music, costume, dance, creativity and Cross River culture.',greeting:'CARNIVAL CALABAR!',accent:'#eea45e',secondary:'#8d3776',label:'Carnival Calabar',category:'Nigerian cultural festival'});
      add(12,29,{name:'Calabar Bikers Carnival',emoji:'🏍️',description:'A lively motorcycle parade and festival event in the Calabar Carnival programme.',greeting:'CALABAR BIKERS CARNIVAL!',accent:'#d8b16f',secondary:'#4f4e8c',label:'Bikers Carnival',category:'Nigerian cultural festival'});
      add(12,30,{name:'Nyoro Ekpe Festival (Calabar)',emoji:'🎭',description:'A cultural Ekpe celebration forming part of the annual Calabar Festival programme.',greeting:'NYORO EKPE!',accent:'#d2a778',secondary:'#624277',label:'Nyoro Ekpe',category:'Nigerian cultural festival'});
      addSeason(12,1,12,31,{name:'Nigerian Music Festival Season',emoji:'🎵',description:'Celebrating Nigerian musicians, live performance, music heritage and emerging talent.',greeting:'NIGERIAN MUSIC FESTIVAL!',accent:'#cf9be2',secondary:'#543d91',label:'Nigerian Music Festival',dateLabel:'December · event programme announced by organisers',category:'Nigerian cultural event',tentative:true});
    addSeason(12,1,12,31,{name:'Nigerian Beer Festival Season (Enugu)',emoji:'🎪',description:'An Enugu-based December festival season listed by the Nigerian Tourism Development Authority, with the exact event dates and programme announced by organisers.',greeting:'NIGERIAN BEER FESTIVAL SEASON!',accent:'#e4bb69',secondary:'#875334',label:'Beer Festival',dateLabel:'December · exact programme dates announced by organisers',category:'Nigerian cultural event',tentative:true});
      addSeason(12,1,12,31,{name:'Countdown Nigeria Festival Season',emoji:'🎆',description:'A nationwide end-of-year season of community countdown events welcoming the new year.',greeting:'COUNTDOWN NIGERIA!',accent:'#e8bf61',secondary:'#8f43da',label:'Countdown Nigeria',dateLabel:'December · participating cities and dates announced annually',category:'Nigerian cultural event',tentative:true});
    } else if(year===2027){
      addSeason(12,1,12,31,{name:'Igue Festival (Benin City)',emoji:'👑',description:'The Edo Igue Festival at the Oba’s Palace in Benin City, celebrating Edo royal heritage and tradition.',greeting:'IGUE FESTIVAL SEASON!',accent:'#d8b56c',secondary:'#65449a',label:'Igue Festival',dateLabel:'Usually in December · 2027 date to be announced by Edo organisers',category:'Nigerian cultural festival',tentative:true});
      addSeason(12,26,12,30,{name:'Calabar Festival and Carnival Season',emoji:'🎊',description:'Cross River’s annual end-of-year cultural carnival season, including cultural parades, junior carnival, band parade, bikers carnival and Nyoro Ekpe.',greeting:'CALABAR FESTIVAL SEASON!',accent:'#eea45e',secondary:'#8d3776',label:'Calabar Festival',dateLabel:'Expected late December · 2027 programme not yet announced',category:'Nigerian cultural festival',tentative:true});
      addSeason(12,1,12,31,{name:'Nigerian Music Festival Season',emoji:'🎵',description:'Celebrating Nigerian musicians, live performance, music heritage and emerging talent.',greeting:'NIGERIAN MUSIC FESTIVAL!',accent:'#cf9be2',secondary:'#543d91',label:'Nigerian Music Festival',dateLabel:'December · event programme announced by organisers',category:'Nigerian cultural event',tentative:true});
      addSeason(12,1,12,31,{name:'Countdown Nigeria Festival Season',emoji:'🎆',description:'A nationwide end-of-year season of community countdown events welcoming the new year.',greeting:'COUNTDOWN NIGERIA!',accent:'#e8bf61',secondary:'#8f43da',label:'Countdown Nigeria',dateLabel:'December · participating cities and dates announced annually',category:'Nigerian cultural event',tentative:true});
    } else {
      addSeason(12,1,12,31,{name:'Igue Festival (Benin City)',emoji:'👑',description:'The Edo Igue Festival at the Oba’s Palace in Benin City, celebrating Edo royal heritage and tradition.',greeting:'IGUE FESTIVAL SEASON!',accent:'#d8b56c',secondary:'#65449a',label:'Igue Festival',dateLabel:'Usually in December · annual date announced by Edo organisers',category:'Nigerian cultural festival',tentative:true});
      addSeason(12,26,12,30,{name:'Calabar Festival and Carnival Season',emoji:'🎊',description:'Cross River’s annual end-of-year cultural carnival season, including cultural parades, junior carnival, band parade, bikers carnival and Nyoro Ekpe.',greeting:'CALABAR FESTIVAL SEASON!',accent:'#eea45e',secondary:'#8d3776',label:'Calabar Festival',dateLabel:'Usually late December · annual programme announced by Cross River organisers',category:'Nigerian cultural festival',tentative:true});
      addSeason(12,1,12,31,{name:'Nigerian Music Festival Season',emoji:'🎵','description':'Celebrating Nigerian musicians, live performance, music heritage and emerging talent.','greeting':'NIGERIAN MUSIC FESTIVAL!','accent':'#cf9be2','secondary':'#543d91','label':'Nigerian Music Festival','dateLabel':'December · event programme announced by organisers','category':'Nigerian cultural event','tentative':true});
      addSeason(12,1,12,31,{name:'Countdown Nigeria Festival Season',emoji:'🎆','description':'A nationwide end-of-year season of community countdown events welcoming the new year.','greeting':'COUNTDOWN NIGERIA!','accent':'#e8bf61','secondary':'#8f43da','label':'Countdown Nigeria','dateLabel':'December · participating cities and dates announced annually','category':'Nigerian cultural event','tentative':true});
    }
    const motheringSunday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),-21);
    add(motheringSunday.month,motheringSunday.day,{name:'Mothering Sunday',emoji:'💐',description:'Celebrating mothers and mother figures for their love, care and support.',greeting:'HAPPY MOTHERING SUNDAY!',accent:'#f2a7c9',secondary:'#9a4d9c',label:'Mothering Sunday'});
    // Lunar observances are planning estimates only; official Nigerian dates
    // are confirmed closer to each occasion after moon-sighting announcements.
    if(year===2027){
      add(2,8,{name:'Ramadan Begins (expected)',emoji:'🌙',description:'Wishing Muslim communities a meaningful month of fasting, prayer, reflection and generosity.',greeting:'RAMADAN MUBARAK!',accent:'#79d6bd',secondary:'#256b93',label:'Ramadan',tentative:true,category:'Islamic observance · tentative'});
      add(3,6,{name:'Laylat al-Qadr (expected)',emoji:'🌙',description:'A sacred night observed by Muslims during the final ten nights of Ramadan; the calendar estimate is provisional.',greeting:'BLESSINGS ON LAYLAT AL-QADR!',accent:'#8dd6c2',secondary:'#2a5b80',label:'Laylat al-Qadr',tentative:true,category:'Islamic observance · tentative'});
      add(3,10,{name:'Eid al-Fitr (expected)',emoji:'🌙',description:'Wishing Muslim families in Nigeria and around the world a joyful Eid filled with peace, gratitude and generosity.',greeting:'HAPPY EID AL-FITR!',accent:'#79d6bd',secondary:'#256b93',label:'Eid al-Fitr',tentative:true,category:'Nigerian public holiday · tentative'});
      add(3,11,{name:'Eid al-Fitr Holiday (expected)',emoji:'🌙',description:'Wishing you a peaceful Eid holiday with family, friends and community.',greeting:'EID MUBARAK!',accent:'#79d6bd',secondary:'#256b93',label:'Eid holiday',tentative:true,category:'Nigerian public holiday · tentative'});
      add(5,15,{name:'Day of Arafah (expected)',emoji:'🕋',description:'A significant day in the Hajj season observed by Muslim communities.',greeting:'BLESSINGS ON THE DAY OF ARAFAH!',accent:'#8bd7b4',secondary:'#287b65',label:'Day of Arafah',tentative:true,category:'Islamic observance · tentative'});
      add(5,17,{name:'Eid al-Adha · Eid-el-Kabir (expected)',emoji:'🌙',description:'Wishing Muslim communities a blessed Eid of faith, generosity and sharing.',greeting:'HAPPY EID-EL-KABIR!',accent:'#8bd7b4',secondary:'#287b65',label:'Eid-el-Kabir',tentative:true,category:'Nigerian public holiday · tentative'});
      add(5,18,{name:'Eid al-Adha Holiday (expected)',emoji:'🌙',description:'May the spirit of sacrifice, care and generosity continue throughout the Eid season.',greeting:'EID MUBARAK!',accent:'#8bd7b4',secondary:'#287b65',label:'Eid holiday',tentative:true,category:'Nigerian public holiday · tentative'});
      addSeason(3,10,3,12,{name:'Northern Nigeria Eid Durbar Festival Window',emoji:'🐎',description:'A northern Nigerian cultural celebration associated with Eid, featuring royal horse parades, music and traditional pageantry.',greeting:'EID DURBAR FESTIVAL!',accent:'#d8b56b',secondary:'#75472e',label:'Eid Durbar',dateLabel:'Around Eid · dates and local programme vary by emirate',category:'Nigerian cultural festival',tentative:true});
      addSeason(5,17,5,19,{name:'Northern Nigeria Eid-el-Kabir Durbar Festival Window',emoji:'🐎',description:'A northern Nigerian Durbar season associated with Eid-el-Kabir, including royal horse parades and traditional performances.',greeting:'EID-EL-KABIR DURBAR!',accent:'#d8b56b',secondary:'#75472e',label:'Eid Durbar',dateLabel:'Around Eid-el-Kabir · dates and local programme vary by emirate',category:'Nigerian cultural festival',tentative:true});
      add(6,6,{name:'Islamic New Year · Al-Hijra (expected)',emoji:'🌙',description:'Wishing Muslim communities a peaceful and meaningful new Islamic year.',greeting:'HAPPY ISLAMIC NEW YEAR!',accent:'#80c6db',secondary:'#3c5d9b',label:'Al-Hijra',tentative:true,category:'Islamic observance · tentative'});
      add(6,15,{name:'Day of Ashura (expected)',emoji:'🌙',description:'An important day in the Islamic calendar, observed in different ways across Muslim communities.',greeting:'BLESSINGS ON ASHURA!',accent:'#80c6db',secondary:'#3c5d9b',label:'Ashura',tentative:true,category:'Islamic observance · tentative'});
      add(8,15,{name:'Eid-el-Maulud · Mawlid (expected)',emoji:'🕌',description:'A day observed by many Muslims in remembrance of the Prophet Muhammad.',greeting:'WARM WISHES ON MAWLID!',accent:'#9ed2b0',secondary:'#36775f',label:'Mawlid',tentative:true,category:'Nigerian public holiday · tentative'});
    } else if(year>=2026){
      // For later years, calculate provisional dates using the browser's
      // Umm al-Qura Hijri calendar. Nigerian moon-sighting declarations win.
      const lunar=(month,day)=>hijriDateInGregorianYear(year,month,day);
      const lunarAdd=(month,day,data)=>{
        const date=lunar(month,day);
        if(date)add(date.month,date.day,{...data,tentative:true,dateNote:'Calculated Hijri-calendar estimate · confirm with Nigerian moon-sighting announcement'});
      };
      lunarAdd(9,1,{name:'Ramadan Begins (estimated)',emoji:'🌙',description:'Wishing Muslim communities a meaningful month of fasting, prayer, reflection and generosity.',greeting:'RAMADAN MUBARAK!',accent:'#79d6bd',secondary:'#256b93',label:'Ramadan',category:'Islamic observance · tentative'});
      lunarAdd(9,27,{name:'Laylat al-Qadr (estimated)',emoji:'🌙',description:'A sacred night observed during the final ten nights of Ramadan; this calendar date is an estimate.',greeting:'BLESSINGS ON LAYLAT AL-QADR!',accent:'#8dd6c2',secondary:'#2a5b80',label:'Laylat al-Qadr',category:'Islamic observance · tentative'});
      const fitr=lunar(10,1);
      if(fitr){
        add(fitr.month,fitr.day,{name:'Eid al-Fitr (estimated)',emoji:'🌙',description:'Wishing Muslim families in Nigeria and around the world a joyful Eid filled with peace, gratitude and generosity.',greeting:'HAPPY EID AL-FITR!',accent:'#79d6bd',secondary:'#256b93',label:'Eid al-Fitr',tentative:true,dateNote:'Calculated Hijri-calendar estimate · confirm with Nigerian moon-sighting announcement',category:'Nigerian public holiday · tentative'});
        const fitrHoliday=addDaysUTC(new Date(Date.UTC(year,fitr.month-1,fitr.day)),1);
        add(fitrHoliday.month,fitrHoliday.day,{name:'Eid al-Fitr Holiday (estimated)',emoji:'🌙',description:'Wishing you a peaceful Eid holiday with family, friends and community.',greeting:'EID MUBARAK!',accent:'#79d6bd',secondary:'#256b93',label:'Eid holiday',tentative:true,dateNote:'Calculated Hijri-calendar estimate · confirm with Nigerian moon-sighting announcement',category:'Nigerian public holiday · tentative'});
        const fitrDurbarEnd=addDaysUTC(new Date(Date.UTC(year,fitr.month-1,fitr.day)),2);
        addSeason(fitr.month,fitr.day,fitrDurbarEnd.month,fitrDurbarEnd.day,{name:'Northern Nigeria Eid Durbar Festival Window',emoji:'🐎',description:'A northern Nigerian cultural celebration associated with Eid, featuring royal horse parades, music and traditional pageantry.',greeting:'EID DURBAR FESTIVAL!',accent:'#d8b56b',secondary:'#75472e',label:'Eid Durbar',dateLabel:'Around Eid · dates and local programme vary by emirate',category:'Nigerian cultural festival',tentative:true});
      }
      const arafah=lunar(12,9);
      if(arafah){
        add(arafah.month,arafah.day,{name:'Day of Arafah (estimated)',emoji:'🕋',description:'A significant day in the Hajj season observed by Muslim communities.',greeting:'BLESSINGS ON THE DAY OF ARAFAH!',accent:'#8bd7b4',secondary:'#287b65',label:'Day of Arafah',tentative:true,dateNote:'Calculated Hijri-calendar estimate · confirm with Nigerian moon-sighting announcement',category:'Islamic observance · tentative'});
        const adha=lunar(12,10);
        if(adha){
          add(adha.month,adha.day,{name:'Eid al-Adha · Eid-el-Kabir (estimated)',emoji:'🌙',description:'Wishing Muslim communities a blessed Eid of faith, generosity and sharing.',greeting:'HAPPY EID-EL-KABIR!',accent:'#8bd7b4',secondary:'#287b65',label:'Eid-el-Kabir',tentative:true,dateNote:'Calculated Hijri-calendar estimate · confirm with Nigerian moon-sighting announcement',category:'Nigerian public holiday · tentative'});
          const adhaHoliday=addDaysUTC(new Date(Date.UTC(year,adha.month-1,adha.day)),1);
          add(adhaHoliday.month,adhaHoliday.day,{name:'Eid al-Adha Holiday (estimated)',emoji:'🌙',description:'May the spirit of sacrifice, care and generosity continue throughout the Eid season.',greeting:'EID MUBARAK!',accent:'#8bd7b4',secondary:'#287b65',label:'Eid holiday',tentative:true,dateNote:'Calculated Hijri-calendar estimate · confirm with Nigerian moon-sighting announcement',category:'Nigerian public holiday · tentative'});
          const adhaDurbarEnd=addDaysUTC(new Date(Date.UTC(year,adha.month-1,adha.day)),2);
          addSeason(adha.month,adha.day,adhaDurbarEnd.month,adhaDurbarEnd.day,{name:'Northern Nigeria Eid-el-Kabir Durbar Festival Window',emoji:'🐎',description:'A northern Nigerian Durbar season associated with Eid-el-Kabir, including royal horse parades and traditional performances.',greeting:'EID-EL-KABIR DURBAR!',accent:'#d8b56b',secondary:'#75472e',label:'Eid Durbar',dateLabel:'Around Eid-el-Kabir · dates and local programme vary by emirate',category:'Nigerian cultural festival',tentative:true});
        }
      }
      lunarAdd(1,1,{name:'Islamic New Year · Al-Hijra (estimated)',emoji:'🌙',description:'Wishing Muslim communities a peaceful and meaningful new Islamic year.',greeting:'HAPPY ISLAMIC NEW YEAR!',accent:'#80c6db',secondary:'#3c5d9b',label:'Al-Hijra',category:'Islamic observance · tentative'});
      lunarAdd(1,10,{name:'Day of Ashura (estimated)',emoji:'🌙',description:'An important day in the Islamic calendar, observed in different ways across Muslim communities.',greeting:'BLESSINGS ON ASHURA!',accent:'#80c6db',secondary:'#3c5d9b',label:'Ashura',category:'Islamic observance · tentative'});
      lunarAdd(3,12,{name:'Eid-el-Maulud · Mawlid (estimated)',emoji:'🕌',description:'A day observed by many Muslims in remembrance of the Prophet Muhammad.',greeting:'WARM WISHES ON MAWLID!',accent:'#9ed2b0',secondary:'#36775f',label:'Mawlid',category:'Nigerian public holiday · tentative'});
    }
    const goodFriday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),-2);
    const easterMonday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),1);
    add(goodFriday.month,goodFriday.day,{name:'Good Friday',emoji:'✝️',description:'A day of reflection and remembrance for Christians around the world.',greeting:'BLESSINGS ON GOOD FRIDAY!',accent:'#c4a0e8',secondary:'#55317d',label:'Good Friday'});
    add(easter.month,easter.day,{name:'Easter Sunday',emoji:'🌅',description:'Celebrating hope, renewal and the resurrection of Jesus Christ.',greeting:'HAPPY EASTER!',accent:'#f1d58a',secondary:'#7e54c2',label:'Easter'});
    add(easterMonday.month,easterMonday.day,{name:'Easter Monday',emoji:'🌼',description:'Wishing you a peaceful Easter season filled with hope and renewal.',greeting:'HAPPY EASTER MONDAY!',accent:'#e8c77e',secondary:'#4f9f83',label:'Easter Monday'});
    // Father’s Day: third Sunday in June.
    add(6,nthWeekday(year,6,0,3),{name:'Father’s Day',emoji:'👔',description:'Celebrating fathers and father figures and the care they give.',greeting:'HAPPY FATHER’S DAY!',accent:'#75c5ed',secondary:'#4454a7',label:'Father’s Day'});
    return events;
  };
  const allEvents=now=>{
    const p=localParts(now);
    return [...eventsForYear(p.year),...eventsForYear(p.year+1)].sort((a,b)=>a.start-b.start);
  };
  const setTheme=event=>{
    root.style.setProperty('--event-accent',event.accent);
    root.style.setProperty('--event-secondary',event.secondary);
    const hex=event.secondary.replace('#','');
    const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
    root.style.setProperty('--event-glow','rgba('+rgb+',.42)');
  };
  const render=now=>{
    const p=localParts(now),today=dateKey(p.year,p.month,p.day),events=allEvents(now);
    $('current-weekday').textContent=weekdayFmt.format(now).toUpperCase();
    $('current-day-number').textContent=String(p.day);
    $('current-month-year').textContent=monthYearFmt.format(now).toUpperCase();
    $('current-time').textContent=clockFmt.format(now).replace(/\s+/g,' ').trim().toUpperCase();
    const activeExactEvents=events.filter(event=>!event.season&&event.key===today&&now>=event.start&&now<event.end);
    // When multiple observances share a date, rotate them on the same 12-second
    // display cycle so none is silently hidden behind another event.
    const activeExact=activeExactEvents.length?activeExactEvents[Math.floor(now.getTime()/12000)%activeExactEvents.length]:null;
    const activeSeasons=events.filter(event=>event.season&&now>=event.start&&now<event.end);
    const activeSeasonCandidate=activeSeasons.length?activeSeasons[Math.floor(now.getTime()/12000)%activeSeasons.length]:null;
    const upcomingExact=events.find(item=>!item.season&&item.start>now);
    // Keep dated observances visible when one is close, even during a broad
    // cultural-season window. Month-only dates never mask an exact event due soon.
    const exactEventDueSoon=Boolean(upcomingExact&&upcomingExact.start.getTime()-now.getTime()<=7*dayMs);
    const activeSeason=(!activeExact&&!exactEventDueSoon)?activeSeasonCandidate:null;
    const active=activeExact||activeSeason;
    const event=active||(exactEventDueSoon?upcomingExact:events.find(item=>item.start>now));
    if(!event)return;
    setTheme(event);
    const celebrating=Boolean(active);
    root.classList.toggle('is-celebrating',celebrating);
    const scene=sceneForEvent(event.name);
    $('event-art').dataset.scene=scene.key;
    $('event-art').setAttribute('aria-label',scene.key.replace(/-/g,' ')+' celebration scene');
    const presentation=presentationForEvent(event);
    root.dataset.tone=presentation.tone;
    $('event-art').dataset.tone=presentation.tone;
    $('event-art').setAttribute('aria-label',event.name+' — '+presentation.label.toLowerCase());
    $('event-emoji').textContent=scene.main||event.emoji;
    $('event-scene-prop-one').textContent=scene.props[0];
    $('event-scene-prop-two').textContent=scene.props[1];
    $('event-scene-prop-three').textContent=scene.props[2];
    $('event-title').textContent=event.name;
    $('event-date').textContent=(event.dateLabel||dateFmt.format(event.start))+(event.dateNote?' · '+event.dateNote:(event.tentative&&!event.dateLabel?(event.category&&/public holiday|eid|mawlud/i.test(event.category+' '+event.name)?' · TENTATIVE — MAY SHIFT WITH MOON SIGHTING':' · EXPECTED DATE — LOCAL CONFIRMATION PENDING'):''));
    $('event-category').textContent=presentation.label;
    $('event-kicker').textContent=activeSeason?'CULTURAL FESTIVAL WINDOW · LOCAL DATES VARY':(celebrating?presentation.todayKicker:'COUNTING DOWN TO THE NEXT DAY THAT MATTERS');
    $('event-status').textContent=activeSeason?'FESTIVAL PERIOD':(celebrating?presentation.todayStatus:'UPCOMING · '+presentation.upcoming);
    $('event-greeting').textContent=event.greeting;
    $('event-description').textContent=event.description;
    $('event-footer-label').textContent=activeSeason?event.label+' season is in progress':(celebrating?presentation.footer+': '+event.label:'Next up: '+event.label);
    $('event-calendar-note').textContent='DCDS · NIGERIA TIME · '+(activeSeason?'SEASON WINDOW · CHECK LOCAL PROGRAMME':(celebrating?presentation.todayStatus:'AUTOMATIC LIVE COUNTDOWN'));
    if(celebrating){
      ['days','hours','minutes','seconds'].forEach(key=>$('count-'+key).textContent='00');
      return;
    }
    const diff=Math.max(0,event.start.getTime()-now.getTime());
    // Round the remaining duration up to the next whole second. This makes
    // the countdown's seconds change on the same wall-clock second as the clock.
    const totalSeconds=Math.ceil(diff/1000);
    const secondsPerDay=dayMs/1000;
    const days=Math.floor(totalSeconds/secondsPerDay);
    const hours=Math.floor((totalSeconds%secondsPerDay)/3600);
    const minutes=Math.floor((totalSeconds%3600)/60);
    const seconds=totalSeconds%60;
    $('count-days').textContent=String(days).padStart(2,'0');
    $('count-hours').textContent=pad(hours);
    $('count-minutes').textContent=pad(minutes);
    $('count-seconds').textContent=pad(seconds);
  };
  // Align every display update to the device clock's exact second boundary.
  // The calendar date, wall clock and remaining countdown all use one timestamp.
  const tick=()=>{
    const nowMs=Date.now();
    render(new Date(nowMs));
    const millisecondsIntoSecond=nowMs%1000;
    window.setTimeout(tick,Math.max(1,1000-millisecondsIntoSecond));
  };
  const firstDelay=1000-(Date.now()%1000);
  window.setTimeout(tick,firstDelay===1000?1:firstDelay);
})();

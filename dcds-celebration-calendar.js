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
  const $ = id => root.querySelector('#' + id);
  const pad = n => String(n).padStart(2, '0');
  const sceneProfiles = [
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
    {key:'eid', test:/eid/i, props:['🌙','🏮','⭐']},
    {key:'good-friday', test:/good friday/i, props:['🕊️','🌿','✨']},
    {key:'easter-monday', test:/easter monday/i, props:['🐇','🌷','🦋']},
    {key:'easter', test:/easter/i, props:['🐣','🌷','🦋']},
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
    if(/ramadan|eid|al-hijra|ashura|mawlid|ash wednesday|palm sunday|maundy thursday|holy saturday|easter sunday|mothering sunday/i.test(name)) return 'Religious observance';
    if(/festival|durbar|ofala|osun|argungu|new yam|mmanwu|igue|olojo|igbogo|calabar|nyalo|regatta|carnival/i.test(name)) return 'Nigerian cultural festival';
    if(/nigerian|nigeria|africa day|commonwealth day|children.s day/i.test(name)) return 'Nigerian national observance';
    if(/world |international day|international women|international youth|african child/i.test(name)) return 'International observance';
    return 'Community and cultural observance';
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
      [6,20,'World Refugee Day','🕊️','Standing with refugees and recognising their courage, rights and resilience.','STAND WITH REFUGEES!','#9cc9e2','#4c638f','Refugees'],
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
      [11,25,'International Day for the Elimination of Violence against Women','🧡','Supporting safety, dignity and freedom from violence for women and girls.','ORANGE THE WORLD · END VIOLENCE!','#efaa75','#a44d67','Safety'],
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
    annualObservances.forEach(([m,d,name,emoji,description,greeting,accent,secondary,label])=>
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
    // Annual cultural festival periods. These are intentionally presented as
    // month/season windows where the organisers do not publish one permanent
    // Gregorian date. Exact editions are added once announced by organisers.
    addSeason(2,1,3,31,{name:'Argungu International Fishing and Cultural Festival',emoji:'🐟',description:'A celebrated Kebbi cultural gathering featuring traditional fishing, canoe races, water competitions, wrestling and community heritage.',greeting:'ARGUNGU FESTIVAL SEASON!',accent:'#68c9d7',secondary:'#1e6178',label:'Argungu Festival',dateLabel:'Usually February–March · annual dates announced by organisers',category:'Nigerian cultural festival',tentative:true});
    addSeason(7,1,7,31,{name:'Tour Nigeria and National Cultural Travel Season',emoji:'🚌',description:'A celebration of domestic tourism, Nigerian destinations and cultural discovery across the states.',greeting:'EXPLORE NIGERIA!',accent:'#e9c36e',secondary:'#397b87',label:'Tour Nigeria',dateLabel:'July · programme dates announced by organisers',category:'Nigerian tourism event'});
    addSeason(8,1,8,7,{name:'Igbo New Yam Festival Season (Iwa Ji / Iri Ji)',emoji:'🌾',description:'Celebrating the new yam harvest and the food, gratitude and community traditions of Igbo communities.',greeting:'HAPPY NEW YAM FESTIVAL SEASON!',accent:'#d8b86e',secondary:'#6c8a48',label:'New Yam Festival',dateLabel:'Early August · local community dates vary',category:'Nigerian cultural festival',tentative:true});
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
    $('event-emoji').textContent=event.emoji;
    $('event-scene-prop-one').textContent=scene.props[0];
    $('event-scene-prop-two').textContent=scene.props[1];
    $('event-scene-prop-three').textContent=scene.props[2];
    $('event-title').textContent=event.name;
    $('event-date').textContent=(event.dateLabel||dateFmt.format(event.start))+(event.tentative&&!event.dateLabel?(event.category&&/public holiday|eid|mawlud/i.test(event.category+' '+event.name)?' · TENTATIVE — MAY SHIFT WITH MOON SIGHTING':' · EXPECTED DATE — LOCAL CONFIRMATION PENDING'):'');
    $('event-category').textContent=event.category||categoryForEvent(event.name);
    $('event-kicker').textContent=activeSeason?'FESTIVAL WINDOW · LOCAL PROGRAMME DATES VARY':(celebrating?'TODAY · CELEBRATION MODE':(event.season?'COUNTING DOWN TO THE FESTIVAL PERIOD':'COUNTING DOWN TO THE NEXT CELEBRATION'));
    $('event-status').textContent=activeSeason?'FESTIVAL PERIOD':(celebrating?'TODAY IS THE DAY':'UPCOMING CELEBRATION');
    $('event-greeting').textContent=event.greeting;
    $('event-description').textContent=event.description;
    $('event-footer-label').textContent=activeSeason?event.label+' season is in progress':(celebrating?event.label+' celebration is live':'Next up: '+event.label);
    $('event-calendar-note').textContent='DCDS · NIGERIA TIME · '+(activeSeason?'SEASON WINDOW · CHECK LOCAL PROGRAMME':(celebrating?'CELEBRATING TODAY':'AUTOMATIC LIVE COUNTDOWN'));
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

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
  const $ = id => root.querySelector('#' + id);
  const pad = n => String(n).padStart(2, '0');
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
      events.push({...data,year,month,day,key:dateKey(year,month,day),start,end:new Date(start.getTime()+dayMs)});
    };
    const fixed=[
      [1,1,'New Year’s Day '+year,'🎆','A fresh year, new ideas and new possibilities.','HAPPY NEW YEAR '+year+'!','#e8bf61','#8f43da','New year'],
      [2,14,'Valentine’s Day','❤️','Celebrate kindness, friendship and the people who make life brighter.','HAPPY VALENTINE’S DAY!','#ff668b','#9f245e','Love and kindness'],
      [3,8,'International Women’s Day','💜','Celebrating the achievements, strength and contributions of women everywhere.','HAPPY INTERNATIONAL WOMEN’S DAY!','#b66af1','#6d35ba','Women’s Day'],
      [3,20,'International Day of Happiness','😊','Share joy, encourage one another and make room for happiness.','HAPPY DAY OF HAPPINESS!','#f5d56d','#35a98b','Choose happiness'],
      [3,22,'World Water Day','💧','A reminder to value, protect and use water responsibly.','WORLD WATER DAY!','#55c6f4','#1764b4','Protect our water'],
      [4,7,'World Health Day','🌍','Recognising the importance of health, wellbeing and care for everyone.','WORLD HEALTH DAY!','#55c78b','#2675a5','Health for all'],
      [4,22,'Earth Day','🌎','Celebrate our planet and take action to care for the environment.','HAPPY EARTH DAY!','#5ecb83','#2875ad','Care for our planet'],
      [5,1,'Workers’ Day','🦺','Honouring workers and the contribution of work to our communities.','HAPPY WORKERS’ DAY!','#f0bd54','#a54a20','Honouring workers'],
      [5,27,'Children’s Day (Nigeria)','🧒','Celebrating children and the importance of their safety, learning and future.','HAPPY CHILDREN’S DAY!','#ffd56b','#4d9bd4','Every child matters'],
      [6,5,'World Environment Day','🌱','Let’s protect nature and build a cleaner, healthier environment.','WORLD ENVIRONMENT DAY!','#68d18a','#218b68','Act for nature'],
      [6,12,'Democracy Day (Nigeria)','🇳🇬','Recognising democracy, civic participation and the people who shape our country.','HAPPY DEMOCRACY DAY!','#61c986','#238d57','Nigeria'],
      [7,15,'World Youth Skills Day','🚀','Skills open doors. Keep learning, creating and building your future.','WORLD YOUTH SKILLS DAY!','#e8bb64','#7b43c7','Skills for the future'],
      [8,12,'International Youth Day','🌟','Celebrating young people, their creativity, energy and role in shaping tomorrow.','HAPPY INTERNATIONAL YOUTH DAY!','#e8c35e','#7950dc','Youth and possibility'],
      [9,21,'International Day of Peace','🕊️','Promoting peace, understanding, unity and hope in every community.','INTERNATIONAL DAY OF PEACE!','#9bd9ef','#4b88c9','Peace and unity'],
      [10,1,'Nigeria Independence Day','🇳🇬','Celebrating Nigeria, its people, culture and hopes for a brighter future.','HAPPY INDEPENDENCE DAY!','#67d28c','#16834e','Nigeria'],
      [10,5,'World Teachers’ Day','📚','Thanking teachers and educators for helping people learn and grow.','HAPPY WORLD TEACHERS’ DAY!','#e9c66a','#6d48b6','Thank you, teachers'],
      [12,25,'Christmas Day','🎄','Wishing everyone peace, love, generosity and a joyful Christmas season.','MERRY CHRISTMAS!','#58d58a','#c53c53','Season of giving'],
      [12,26,'Boxing Day','🎁','A day for generosity, gratitude, rest and time with loved ones.','HAPPY BOXING DAY!','#e9c46a','#b33a55','Share the joy']
    ];
    fixed.forEach(([m,d,name,emoji,description,greeting,accent,secondary,label])=>add(m,d,{name,emoji,description,greeting,accent,secondary,label}));
    // Easter dates are calculated for each Gregorian year.
    const easter=easterSunday(year);
    const motheringSunday=addDaysUTC(new Date(Date.UTC(year,easter.month-1,easter.day)),-21);
    add(motheringSunday.month,motheringSunday.day,{name:'Mothering Sunday',emoji:'💐',description:'Celebrating mothers and mother figures for their love, care and support.',greeting:'HAPPY MOTHERING SUNDAY!',accent:'#f2a7c9',secondary:'#9a4d9c',label:'Mothering Sunday'});
    // 2027 Islamic dates are preliminary calendar estimates for Nigeria and may shift with moon sighting.
    if(year===2027){
      add(3,10,{name:'Eid al-Fitr (expected)',emoji:'🌙',description:'Wishing Muslim families in Nigeria and around the world a joyful Eid filled with peace, gratitude and generosity.',greeting:'HAPPY EID AL-FITR!',accent:'#79d6bd',secondary:'#256b93',label:'Eid al-Fitr',tentative:true});
      add(3,11,{name:'Eid al-Fitr Holiday (expected)',emoji:'🌙',description:'Wishing you a peaceful Eid holiday with family, friends and community.',greeting:'EID MUBARAK!',accent:'#79d6bd',secondary:'#256b93',label:'Eid holiday',tentative:true});
      add(5,17,{name:'Eid al-Adha · Eid-el-Kabir (expected)',emoji:'🌙',description:'Wishing Muslim communities a blessed Eid of faith, generosity and sharing.',greeting:'HAPPY EID-EL-KABIR!',accent:'#8bd7b4',secondary:'#287b65',label:'Eid-el-Kabir',tentative:true});
      add(5,18,{name:'Eid al-Adha Holiday (expected)',emoji:'🌙',description:'May the spirit of sacrifice, care and generosity continue throughout the Eid season.',greeting:'EID MUBARAK!',accent:'#8bd7b4',secondary:'#287b65',label:'Eid holiday',tentative:true});
      add(6,6,{name:'Islamic New Year · Al-Hijra (expected)',emoji:'🌙',description:'Wishing Muslim communities a peaceful and meaningful new Islamic year.',greeting:'HAPPY ISLAMIC NEW YEAR!',accent:'#80c6db',secondary:'#3c5d9b',label:'Al-Hijra',tentative:true});
      add(8,15,{name:'Eid-el-Maulud · Mawlid (expected)',emoji:'🕌',description:'A day observed by many Muslims in remembrance of the Prophet Muhammad.',greeting:'WARM WISHES ON MAWLID!',accent:'#9ed2b0',secondary:'#36775f',label:'Mawlid',tentative:true});
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
  const allEvents=()=>{
    const p=localParts(new Date());
    return [...eventsForYear(p.year),...eventsForYear(p.year+1)].sort((a,b)=>a.start-b.start);
  };
  const setTheme=event=>{
    root.style.setProperty('--event-accent',event.accent);
    root.style.setProperty('--event-secondary',event.secondary);
    const hex=event.secondary.replace('#','');
    const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
    root.style.setProperty('--event-glow','rgba('+rgb+',.42)');
  };
  const render=()=>{
    const now=new Date(),p=localParts(now),today=dateKey(p.year,p.month,p.day),events=allEvents();
    const active=events.find(event=>event.key===today&&now>=event.start&&now<event.end);
    const event=active||events.find(item=>item.start>now);
    if(!event)return;
    setTheme(event);
    const celebrating=Boolean(active);
    root.classList.toggle('is-celebrating',celebrating);
    $('event-emoji').textContent=event.emoji;
    $('event-title').textContent=event.name;
    $('event-date').textContent=dateFmt.format(event.start)+(event.tentative?' · EXPECTED DATE — MAY SHIFT WITH MOON SIGHTING':'');
    $('event-kicker').textContent=celebrating?'TODAY · CELEBRATION MODE':'COUNTING DOWN TO THE NEXT CELEBRATION';
    $('event-status').textContent=celebrating?'TODAY IS THE DAY':'UPCOMING CELEBRATION';
    $('event-greeting').textContent=event.greeting;
    $('event-description').textContent=event.description;
    $('event-footer-label').textContent=celebrating?event.label+' celebration is live':'Next up: '+event.label;
    $('event-calendar-note').textContent='DCDS · NIGERIA TIME · '+(celebrating?'CELEBRATING TODAY':'AUTOMATIC LIVE COUNTDOWN');
    if(celebrating){
      ['days','hours','minutes','seconds'].forEach(key=>$('count-'+key).textContent='00');
      return;
    }
    const diff=Math.max(0,event.start.getTime()-now.getTime());
    const days=Math.floor(diff/dayMs),hours=Math.floor((diff%dayMs)/hourMs);
    const minutes=Math.floor((diff%hourMs)/60000),seconds=Math.floor((diff%60000)/1000);
    $('count-days').textContent=String(days).padStart(2,'0');
    $('count-hours').textContent=pad(hours);
    $('count-minutes').textContent=pad(minutes);
    $('count-seconds').textContent=pad(seconds);
  };
  render();
  window.setInterval(render,1000);
})();

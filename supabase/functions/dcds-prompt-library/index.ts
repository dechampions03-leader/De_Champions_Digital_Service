import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COURSE_SLUG = "ai-tools-prompts";
const PAGE_SIZE = 16;
const ALLOWED_ORIGINS = new Set([
  "https://dechampions03-leader.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function responseHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://dechampions03-leader.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store, private",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

const providers = [
  {name:'ChatGPT',mark:'✳',logo:'chatgpt.svg',css:'chatgpt',bg:'linear-gradient(110deg,#116d58,#159b79)',guidance:'For ChatGPT: follow the brief closely, organise the response with useful headings, and separate the finished deliverable from assumptions or notes.'},
  {name:'Claude',mark:'✳',logo:'claude.svg',css:'claude',bg:'linear-gradient(110deg,#8b3d28,#cf7651)',guidance:'For Claude: preserve nuance and consistency, respect every supplied constraint, and produce a complete, carefully structured result without inventing missing facts.'},
  {name:'Gemini',mark:'✦',logo:'gemini.svg',css:'gemini',bg:'linear-gradient(110deg,#3655a7,#7863d6)',guidance:'For Gemini: make the response clear and visually descriptive where relevant; organise creative, visual or multimedia requirements into distinct production details.'},
  {name:'Grok',mark:'G',logo:'grok.svg',css:'grok',bg:'linear-gradient(110deg,#20242d,#4a4d57)',guidance:'For Grok: be direct, original and practical; challenge weak assumptions politely, distinguish verified facts from guesses, and avoid inflated claims.'}
];

const contexts = [
  {name:'Fashion and clothing brand',sample:'A growing fashion label preparing a clean product launch for customers who shop on mobile.'},
  {name:'Restaurant and food business',sample:'A neighbourhood restaurant introducing a new menu and trying to attract repeat customers.'},
  {name:'Beauty or wellness studio',sample:'A beauty studio promoting its services with a welcoming and trustworthy brand identity.'},
  {name:'Digital skills academy',sample:'A digital learning academy teaching beginners practical creative and technology skills.'},
  {name:'Technology startup',sample:'An early-stage technology startup explaining a useful product to its first target customers.'},
  {name:'Real-estate business',sample:'A property business presenting a new residential listing to prospective buyers.'},
  {name:'Travel and hospitality brand',sample:'A travel company promoting a relaxing local getaway for families and working professionals.'},
  {name:'Agriculture project',sample:'An agriculture venture helping customers understand a farm product and its value chain.'},
  {name:'E-commerce store',sample:'An online store preparing a clear product page and a trustworthy shopping experience.'},
  {name:'Professional consultant',sample:'An independent consultant presenting a specialist service to business clients.'},
  {name:'Community or non-profit project',sample:'A community initiative inviting people to support a practical local improvement project.'},
  {name:'Music artist or record label',sample:'An independent music artist introducing an original release to listeners.'},
  {name:'Content creator channel',sample:'A creator building a recognisable channel with useful videos and a consistent voice.'},
  {name:'Event organiser',sample:'An event organiser promoting a conference or celebration and communicating essential details.'},
  {name:'Fitness and coaching service',sample:'A coach creating encouraging educational content for people beginning a fitness journey.'},
  {name:'Children’s learning project',sample:'An age-appropriate learning project making a simple educational idea engaging for children.'},
  {name:'Personal professional portfolio',sample:'A professional showcasing real skills, selected projects and a clear contact route.'},
  {name:'Financial services brand',sample:'A financial education brand explaining general money concepts carefully and responsibly.'},
  {name:'Home services company',sample:'A home services provider explaining its booking process, service area and customer promise.'},
  {name:'Local retail shop',sample:'A local shop promoting a seasonal offer while keeping prices and product details accurate.'},
  {name:'Mobile app product',sample:'A mobile application team explaining a new feature and the problem it solves.'},
  {name:'Creative agency',sample:'A creative agency presenting its design, video and digital communication services.'},
  {name:'Faith-based organisation',sample:'An organisation preparing a respectful event message for its own community.'},
  {name:'Podcast or media channel',sample:'A podcast team preparing a new episode and a recognisable opening identity.'},
  {name:'Manufacturing brand',sample:'A small manufacturer presenting the purpose, features and uses of a practical product.'}
];

const specializedContexts = {"Music & Audio":[["Independent music artist","An independent singer-songwriter preparing an original release and building a recognisable musical identity."],["Gospel worship team","A worship team creating an original song for a congregation, prayer gathering or faith-based music project."],["Afrobeats performer","An Afrobeats performer developing a fresh single for listeners who enjoy rhythmic, energetic music."],["R&B vocalist","An R&B vocalist shaping an intimate, expressive song with a smooth melodic flow."],["Hip-hop storyteller","A rapper developing a story-led track with distinctive verses and a memorable refrain."],["Highlife music group","A highlife band creating a joyful song that celebrates culture, community and everyday life."],["Children's learning song","An educator creating a simple, age-appropriate song that helps children remember a lesson."],["Wedding music project","A couple or performer preparing original music for a wedding, anniversary or first dance."],["Birthday celebration","A family or friend creating a personalised birthday song for someone special."],["Motivational campaign","A team creating an uplifting anthem for a personal-development or community campaign."],["Short film soundtrack","A filmmaker commissioning an original vocal or instrumental piece for a key scene."],["Podcast audio identity","A podcast host creating a short, recognisable intro or outro for a regular show."],["Video game sound design","A game creator planning an original loop or theme that supports gameplay and atmosphere."],["Sports team anthem","A sports team preparing a chant or anthem that supporters can sing together."],["Youth choir performance","A youth choir preparing an original piece with accessible language and a strong group chorus."],["Charity awareness project","A nonprofit creating a song that communicates a cause with dignity and emotional clarity."],["Cultural festival","A festival organiser commissioning a lively song for a local cultural celebration."],["Fashion runway production","A fashion event producer planning original music that supports a runway sequence."],["Radio station identity","A radio producer building a short station jingle and audio signature."],["Relaxation and reflection","A creator composing calm original music for reflection, rest or a peaceful visual scene."],["Graduation celebration","A school or graduating group preparing a song about achievement and new beginnings."],["Dance challenge","A creator writing a short hook with a clear rhythmic phrase for an original dance challenge."],["Brand sound identity","A company creating an original musical signature for videos, advertisements and events."],["School event performance","A school preparing an original song for a presentation, prize-giving or special event."],["Artist EP release","An artist developing a lead track that fits the story and sound of a new EP."]],"AI Image Creation":[["Reference portrait recreation","A user uploads a portrait and wants a carefully controlled scene change while retaining the person's visible features."],["Fashion campaign image","A clothing brand needs a polished campaign image showing garment details, styling and a deliberate pose."],["Food product photograph","A food business needs an appetising, realistic product photograph with accurate presentation."],["Cosmetics product scene","A beauty brand needs a premium product image with clean reflections, textures and studio lighting."],["Interior design visual","An interior designer needs a realistic visual of a furnished room with a specified layout and materials."],["Real-estate property image","A property marketer needs a clear, attractive image of a real room or property without altering factual features."],["Technology product render","A technology company wants a clean product hero visual with accurate device proportions and materials."],["Luxury watch photography","A retailer needs a premium close-up image with controlled metal reflections and legible product details."],["Jewellery campaign","A jewellery brand needs elegant product imagery that shows shape, finish and stone details clearly."],["Skincare campaign","A skincare company needs a clean product composition with realistic packaging and a refined colour palette."],["Book cover concept","An author needs a distinctive book-cover concept that leaves clear space for title and author typography."],["Event poster artwork","An event organiser needs a poster visual with a deliberate focal point and room for accurate event text."],["Business flyer design","A small business needs a professional flyer concept that supports a clear offer and readable hierarchy."],["Logo concept exploration","A new brand needs original logo directions based on its values, audience and practical use cases."],["Character design sheet","An animator needs a consistent character reference showing front, side, back and expression views."],["Children's story illustration","An author needs friendly, age-appropriate illustrations with consistent characters and visual continuity."],["Travel destination image","A travel brand needs an evocative destination visual while keeping real-world details accurate."],["Restaurant menu hero image","A restaurant needs a clean food image for a menu, campaign or delivery listing."],["Product background replacement","A seller wants to replace a distracting background while preserving the product itself."],["Photo cleanup and inpainting","A user needs selected unwanted objects removed without changing the rest of the photograph."],["Professional profile portrait","A professional wants a suitable profile image with natural lighting and realistic facial details."],["Architecture concept render","An architect needs a concept visual that communicates the massing, materials and surrounding environment."],["Music cover artwork","A musician needs original cover artwork that communicates the sound and mood of a single or album."],["Social media carousel artwork","A creator needs a consistent set of images with clear visual hierarchy across multiple slides."],["E-commerce product catalogue","An online seller needs a consistent series of product images with accurate product colours and proportions."]],"AI Video Creation":[["Cinematic story scene","A filmmaker needs a short cinematic sequence with intentional camera movement and consistent characters."],["Product launch advert","A business needs a concise video introducing a product, showing its real features and ending with a clear next step."],["Music video sequence","A musician needs visual scenes that follow the rhythm, mood and story of an original track."],["Restaurant promotion","A restaurant needs a short video showing food preparation, presentation and the atmosphere of the venue."],["Beginner tutorial","An educator needs a step-by-step video that makes a practical skill easy to understand."],["Vertical social video","A creator needs a 9:16 video for Reels, Shorts or another mobile-first platform."],["Image animation","A user uploads a still image and wants selected subjects or environmental elements animated naturally."],["Multi-scene brand story","A company needs a coherent series of shots with matching colours, locations and brand details."],["Real-estate walkthrough","A property marketer needs a guided visual tour with a clear sense of layout and room transitions."],["Travel destination film","A travel company needs a short sequence communicating the atmosphere and appeal of a destination."],["Presenter-led course video","An academy needs a presenter video with natural speech, readable captions and supporting visuals."],["Whiteboard explainer","A teacher needs a simple animated explanation using progressive drawings and clear narration."],["App feature demonstration","A software team needs a product walkthrough showing the user flow and the value of a feature."],["Event highlight reel","An event organiser needs a short recap with a strong opening, key moments and a polished close."],["Nonprofit awareness video","A community project needs a respectful video that explains its purpose and the action people can take."],["Fashion lookbook film","A clothing brand needs a short fashion film with consistent garments, lighting and model styling."],["Beauty product demonstration","A beauty brand needs a clear demonstration showing product texture and application responsibly."],["Children's educational animation","An educator needs safe, simple animated scenes for a young learning audience."],["Podcast video clips","A podcast team needs short clips with readable captions and natural cuts from a longer conversation."],["Sports promo sequence","A sports team needs energetic but clear shots introducing a match, team or campaign."],["Founder story video","A founder needs a story-led video built from real milestones, motivations and supplied photos."],["Corporate presentation video","A business needs a clean explainer to introduce its services to partners or customers."],["AI avatar announcement","An organisation needs a presenter-style announcement that uses an authorised avatar and approved script."],["Behind-the-scenes film","A creative team wants a sequence showing the making of a product or project."],["Short documentary scene","A documentary creator needs a grounded scene with realistic details and continuity."]],"Digital Products & Analysis":[["Portfolio website","A professional is building a portfolio that presents real work, skills and a clear contact route."],["Digital academy portal","A learning platform is improving student sign-in, lessons, progress and course navigation."],["E-commerce checkout","An online shop needs a clear, secure checkout journey with reliable validation and error handling."],["Mobile app feature","A mobile product team is designing and implementing a new feature for its users."],["Business dashboard","A business needs a dashboard that explains performance indicators and supports decisions."],["Supabase-backed application","A developer is building an application with Supabase authentication, database access and row-level security."],["Responsive landing page","A company needs a mobile-first website section that explains an offer and guides visitors."],["Booking application","A service business is planning appointment selection, availability and booking confirmation."],["Student assessment system","An academy needs a secure assessment flow with submissions, feedback and resubmission states."],["Notification centre","A product team is implementing notifications, unread states and announcement visibility."],["Admin management panel","An administrator needs safe controls for managing users, approvals and system records."],["Data cleaning task","An analyst needs to standardise inconsistent rows and document how missing values are handled."],["Sales performance sheet","A small business wants to calculate sales totals, margins, trends and monthly comparisons."],["Budget and cash-flow model","A founder needs a spreadsheet to plan income, expenses, runway and scenario assumptions."],["Inventory tracking sheet","A retailer wants a stock tracker with reorder thresholds and basic movement history."],["API integration","A developer is connecting an external API with authentication, validation and clear failure handling."],["Database schema design","A team is modelling relational data with sensible keys, constraints and access policies."],["Debugging a web interface","A developer is troubleshooting a responsive web page that behaves differently across devices."],["JavaScript application logic","A developer needs maintainable JavaScript for a form, search, state transition or interactive component."],["Backend service development","A developer is building a backend endpoint with authentication, input validation and predictable responses."],["Course progress reporting","An academy needs accurate completion reporting without exposing another learner's records."],["Customer feedback analysis","A business is summarising customer comments and separating recurring themes from isolated opinions."],["Presentation for investors","A founder needs a concise deck based on actual product, traction and financial facts."],["Content production workflow","A team wants to organise creative briefs, review stages and publishing tasks."],["Quality assurance test plan","A product team needs test cases for its core flows, permissions and likely failure states."]]};

function contextFor(task, contextIndex){
  const configuredPool = specializedContexts[task.category];
  const pool = Array.isArray(configuredPool) && configuredPool.length
    ? configuredPool
    : contexts;
  const raw = pool[((contextIndex % pool.length) + pool.length) % pool.length];

  // Specialist pools are stored as [name, sample] pairs to keep the data compact.
  // Normalise them into the { name, sample } shape used by cards and prompt builders.
  if (Array.isArray(raw)) {
    const name = typeof raw[0] === 'string' && raw[0].trim()
      ? raw[0].trim()
      : task.title;
    const sample = typeof raw[1] === 'string' && raw[1].trim()
      ? raw[1].trim()
      : task.purpose;
    return { name, sample };
  }

  if (raw && typeof raw === 'object') {
    const name = typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : task.title;
    const sample = typeof raw.sample === 'string' && raw.sample.trim()
      ? raw.sample.trim()
      : task.purpose;
    return { name, sample };
  }

  return { name: task.title, sample: task.purpose };
}

const directions = [
  {name:'Clear and beginner-friendly',detail:'Use plain language, define unfamiliar terms, and make the result easy for a first-time user to follow.'},
  {name:'Premium and polished',detail:'Use refined wording, deliberate structure, considered details and a premium presentation without sounding exaggerated.'},
  {name:'Minimal and direct',detail:'Remove unnecessary wording, prioritise the central message, and keep the output focused and easy to scan.'},
  {name:'Warm and human',detail:'Use a natural, respectful and relatable voice that feels helpful rather than robotic or overly promotional.'},
  {name:'Bold and energetic',detail:'Create a confident, memorable result with strong opening impact while keeping claims realistic and clear.'},
  {name:'Cinematic and story-led',detail:'Build a strong sense of atmosphere, progression, emotion and visual or narrative continuity.'},
  {name:'Educational and structured',detail:'Explain the logic step by step, use practical examples, and finish with a useful action or check.'},
  {name:'Persuasive but honest',detail:'Make the value easy to understand, address real objections and use a clear call to action without pressure or false promises.'},
  {name:'Data-informed and precise',detail:'Use measurable details where supplied, state assumptions, and separate verified facts from estimates.'},
  {name:'Playful and imaginative',detail:'Use fresh ideas and lively expression while staying suitable for the audience and the project.'}
];

const tasks = [
 {category:'Music & Audio',title:'Original song lyrics — Gospel and worship',purpose:'Write original gospel or worship lyrics with a heartfelt message, a singable chorus and a clear spiritual theme.',kind:'music',instruction:'Write original gospel or worship song lyrics from the supplied faith theme, testimony or scripture reference. Create a reverent, memorable chorus, natural verses, a bridge that builds meaning and language suitable for the intended congregation or listener. Use only scripture references the user supplies or ask before quoting a passage. Do not imitate a named worship artist or reuse existing lyrics.',output:'A song title, core message, suggested tempo and mood, complete labelled lyrics, optional call-and-response section and a note for the worship leader.',example:'An original contemporary gospel song about gratitude, grace and trusting God through a difficult season.'},
 {category:'Music & Audio',title:'Original song lyrics — Afrobeats and Afropop',purpose:'Create a fresh Afrobeats or Afropop lyric with rhythmic phrasing, a catchy hook and a strong cultural feel.',kind:'music',instruction:'Write original Afrobeats or Afropop lyrics around the supplied theme and audience. Build a short, memorable hook, rhythmic verses, natural code-switching only where requested, and a clean structure that can sit over the specified groove. Make the language sound natural when sung. Do not imitate a named artist, copy a hit song or reuse a recognisable melody.',output:'Three possible hooks, one recommended title, complete verse/pre-chorus/chorus/bridge lyrics, mood and BPM range, and a short vocal-delivery guide.',example:'An upbeat Afropop song about ambition, friendship and enjoying the journey.'},
 {category:'Music & Audio',title:'Original song lyrics — Love and celebration',purpose:'Write original romantic or celebratory lyrics with authentic emotion, memorable imagery and a singable refrain.',kind:'music',instruction:'Create original love or celebration song lyrics from the relationship, occasion, mood and details supplied. Use specific emotional imagery rather than generic clichés. Keep the sentiment appropriate to the requested audience, give the chorus a clear central line and make the verses progress the story. Do not imitate a named singer or reuse protected lyrics.',output:'A title, emotional concept, complete labelled lyrics, suggested musical direction and two alternative chorus hooks.',example:'A warm anniversary song that celebrates loyalty, shared memories and choosing one another.'},
 {category:'Music & Audio',title:'Original song lyrics — Inspirational and motivational',purpose:'Develop uplifting original lyrics that tell a story of resilience, progress and hope.',kind:'music',instruction:'Write original motivational song lyrics around the supplied journey, challenge or achievement. Start with a relatable struggle, build toward a strong turning point and deliver a chorus that feels empowering without making unrealistic promises. Use vivid but clear language, purposeful repetition and a natural rhyme flow. Do not copy a famous song or imitate a named artist.',output:'A title, one-sentence theme, full verse/chorus/bridge structure, suggested tempo and production mood, plus a short explanation of the emotional arc.',example:'An uplifting anthem about rebuilding after setbacks and continuing to work toward a dream.'},
 {category:'Music & Audio',title:'Children’s nursery rhyme',purpose:'Create an age-appropriate rhyme with repetition, rhythm and a simple learning objective.',kind:'music',instruction:'Write an original, age-appropriate nursery rhyme for the supplied age range and learning goal. Use simple vocabulary, gentle repetition, a memorable refrain and a positive message. Avoid frightening imagery, unsafe imitation instructions and stereotypes.',output:'A rhyme title, learning objective, complete verses and refrain, suggested tempo, actions children may safely follow, and a simple melody mood description.',example:'A cheerful counting rhyme for early learners about everyday objects.'},
 {category:'Music & Audio',title:'Podcast intro and outro',purpose:'Create a recognisable opening and closing for a podcast or media show.',kind:'music',instruction:'Write a concise podcast opening and closing. Introduce the show name, topic, audience benefit and host only from supplied facts. Include optional voice direction, music mood, sound logo and a natural invitation to follow or return.',output:'A 10–15 second intro, a 10-second outro, an optional tagline and a production prompt for the music bed.',example:'A weekly podcast that makes digital skills easier for beginners.'},

 {category:'Writing & Communication',title:'Professional letter',purpose:'Draft a formal letter that communicates a request, announcement, appreciation or decision clearly.',kind:'writing',instruction:'Draft a professional letter for the stated recipient and purpose. Use an appropriate subject, respectful opening, concise context, clear main request or message, any necessary dates or reference details, and a courteous close. Use placeholders for missing personal information; never invent addresses, positions or dates.',output:'A complete letter with subject, greeting, body, closing and clearly marked placeholders for details the sender must confirm.',example:'A formal request letter from a small business to a service provider.'},
 {category:'Writing & Communication',title:'Professional email',purpose:'Write an email that is clear, courteous and easy for the recipient to act on.',kind:'writing',instruction:'Create a professional email for the supplied situation. Make the subject specific, put the purpose near the beginning, organise details into short paragraphs, and end with one clear next step. Match the formality to the relationship.',output:'Three subject-line options and one ready-to-send email with any missing details shown in square brackets.',example:'An email asking a potential partner for a short introductory meeting.'},
 {category:'Writing & Communication',title:'Personal introduction and biography',purpose:'Present a person, founder or professional with a compelling but truthful introduction.',kind:'writing',instruction:'Write a polished introduction or short biography using only the facts supplied. Bring out the person’s role, relevant experience, values, work and audience benefit. Do not invent awards, qualifications, clients or achievements.',output:'A short spoken introduction, a social profile version and a fuller professional biography.',example:'A founder introducing a new creative and digital services business.'},
 {category:'Writing & Communication',title:'CV or resume',purpose:'Organise real experience and skills into a clear, role-focused CV or resume.',kind:'writing',instruction:'Create a clean, role-targeted CV from the candidate’s actual details. Prioritise relevant skills, work, education, projects and measurable achievements when supplied. Do not invent experience or qualifications; use honest placeholders where facts are missing.',output:'A structured CV, a professional summary, relevant skill groups and a list of missing details the candidate should add.',example:'A beginner digital designer applying for a junior creative role.'},
 {category:'Writing & Communication',title:'Job application cover letter',purpose:'Connect a candidate’s genuine experience to the requirements of a specific role.',kind:'writing',instruction:'Draft a tailored cover letter using the actual job description and candidate information. Show how the candidate’s real strengths match the employer’s needs, give one concrete example where available, and finish with a professional call to discuss the role.',output:'A ready-to-edit cover letter and a short checklist of facts to verify before sending.',example:'A junior video editor applying to a small media agency.'},
 {category:'Writing & Communication',title:'Business proposal',purpose:'Present a service or project with scope, deliverables, timing and commercial clarity.',kind:'writing',instruction:'Create a client-ready business proposal. Explain the client problem, proposed solution, scope, deliverables, assumptions, timeline, responsibilities, price fields, revision terms and next steps. Do not invent a quote or guarantee results.',output:'An executive summary, solution, deliverables table, timeline, investment section with editable placeholders, exclusions and acceptance steps.',example:'A proposal for monthly social media design and short-form video services.'},
 {category:'Writing & Communication',title:'Speech or welcome address',purpose:'Prepare a speech with a strong opening, logical flow and memorable close.',kind:'writing',instruction:'Write a speech for the supplied speaker, occasion, audience and duration. Use a natural spoken rhythm, a clear opening, three or fewer main ideas, relevant examples and an appropriate closing. Do not invent personal stories or public facts.',output:'A complete speech, estimated speaking time, delivery notes and optional shorter version.',example:'A founder’s welcome address at the launch of a digital learning programme.'},
 {category:'Writing & Communication',title:'Story or screenplay',purpose:'Develop an original story or scene with character motivation and narrative momentum.',kind:'writing',instruction:'Create an original story or screenplay from the supplied premise. Establish the main character, goal, obstacle, setting, turning point and satisfying ending. Give dialogue distinct voices and make every scene advance the story.',output:'A logline, short outline, character notes and the requested story or screenplay in clearly labelled scenes.',example:'A short inspirational story about a young creator building a first project.'},
 {category:'Writing & Communication',title:'YouTube video script',purpose:'Write a viewer-focused script with a hook, clear teaching or storytelling and a strong ending.',kind:'writing',instruction:'Create a YouTube script for the supplied topic and viewer. Start with a truthful hook, state what viewers will gain, structure the main sections, suggest useful visual cutaways and end with a relevant call to action. Avoid padding and unsupported claims.',output:'A title idea, opening hook, full spoken script, suggested on-screen text, B-roll notes and closing CTA.',example:'A beginner tutorial explaining how to write a useful AI prompt.'},
 {category:'Writing & Communication',title:'Educational lesson or tutorial',purpose:'Turn a topic into a lesson that teaches a learner progressively and checks understanding.',kind:'writing',instruction:'Teach the supplied topic at the learner’s current level. Start with learning outcomes and prerequisites, explain one step at a time, demonstrate with a worked example, give a manageable practice activity and explain how to check the result.',output:'Lesson title, outcomes, explanation, worked example, practice task, answer-check method and next step.',example:'A beginner lesson on planning a simple social media content calendar.'},
 {category:'Writing & Communication',title:'Product or service description',purpose:'Explain what an offer is, who it helps and why its real features matter.',kind:'writing',instruction:'Write a persuasive, accurate product or service description based on supplied features and evidence. Identify the intended customer, practical benefits, limitations, included items and next action. Never invent specifications, warranties or results.',output:'A short summary, a detailed description, feature-benefit bullets and a clear CTA.',example:'A description for an online course that teaches practical graphic design.'},
 {category:'Writing & Communication',title:'Blog post or article',purpose:'Create a useful article with a clear structure, specific examples and a reader takeaway.',kind:'writing',instruction:'Plan and write an original article for the specified audience and goal. Use a compelling but accurate headline, a useful introduction, logical subheadings, examples and a practical conclusion. Flag claims that require sources instead of inventing citations.',output:'Headline options, outline, full draft, suggested meta description and a short source-check list for factual claims.',example:'An article explaining how small businesses can plan a month of useful content.'},
 {category:'Writing & Communication',title:'Social media caption',purpose:'Write platform-appropriate captions that communicate one clear message.',kind:'writing',instruction:'Create platform-aware social captions for the supplied post. Make the first line engaging, communicate one key idea, use a natural voice, include a clear action and suggest only relevant hashtags. Do not add fake statistics or engagement bait.',output:'Five caption variations with different opening approaches and one recommended CTA.',example:'A launch announcement for a new beginner-friendly design class.'},
 {category:'Writing & Communication',title:'Client communication message',purpose:'Help a freelancer or business communicate clearly with a client at any project stage.',kind:'writing',instruction:'Draft a respectful client message for the stated situation: enquiry, clarification, progress update, revision, delay, delivery or follow-up. Acknowledge the situation, state the facts, offer a practical next step and avoid blame or pressure.',output:'A concise message, a slightly warmer alternative and any details that need confirmation before sending.',example:'A designer updating a customer that a first draft is ready for review.'},

 {category:'Business Strategy',title:'Business idea generator',purpose:'Find realistic business ideas matched to a target market, skills and available resources.',kind:'business',instruction:'Generate practical business ideas for the stated location, audience, skills, budget range and constraints. For each idea explain the customer problem, proposed solution, startup requirements, first validation test, likely risks and how to measure early interest. Do not promise earnings.',output:'A ranked shortlist with customer problem, offer, resources, low-cost validation test, risks and a first-week action plan.',example:'A student exploring low-capital digital services for small local businesses.'},
 {category:'Business Strategy',title:'Business plan builder',purpose:'Turn a business concept into an organised plan that can be tested and improved.',kind:'business',instruction:'Build a practical business plan from the supplied concept. Cover customer problem, value proposition, market assumptions, offer, channels, operations, team, costs, revenue assumptions, risks and measurable milestones. Clearly label estimates and unknowns.',output:'An executive summary, business model, customer and market section, go-to-market plan, operations, financial assumptions, risks and 90-day milestones.',example:'A small creative studio offering design and short video packages.'},
 {category:'Business Strategy',title:'Market research plan',purpose:'Plan customer research that tests demand instead of relying on guesses.',kind:'business',instruction:'Design a lean market research study for the product or service. Define the target segment, key questions, research methods, sampling limitations, competitor signals and decision criteria. Create interview questions that avoid leading respondents.',output:'Research objectives, hypotheses, interview or survey questions, simple collection plan, analysis framework and go/no-go criteria.',example:'Testing whether independent shops need monthly social media design support.'},
 {category:'Business Strategy',title:'Competitor analysis',purpose:'Compare relevant alternatives and identify defensible ways to stand out.',kind:'business',instruction:'Create a competitor analysis framework. Use only competitor details supplied by the user or clearly mark what must be researched. Compare audience, offer, positioning, pricing evidence, strengths, weaknesses, channels and customer experience.',output:'A comparison table, key patterns, gaps worth testing, differentiation options and a list of evidence still needed.',example:'Comparing three local providers of website design services.'},
 {category:'Business Strategy',title:'Pricing and service packages',purpose:'Structure offers with clear deliverables, boundaries and sensible pricing logic.',kind:'business',instruction:'Design tiered service packages based on the supplied costs, skills, customer segment and market evidence. Define scope, quantities, delivery time, revision limits, exclusions and optional add-ons. Show the pricing logic and avoid arbitrary guarantees.',output:'Three package tiers, a deliverables comparison, cost and margin assumptions, add-ons and a client-ready explanation.',example:'Starter, Growth and Premium packages for monthly social media content.'},
 {category:'Business Strategy',title:'Brand name and tagline creator',purpose:'Develop memorable, suitable names and taglines for a product or organisation.',kind:'business',instruction:'Generate original brand-name and tagline directions using the supplied purpose, audience, personality and naming constraints. Explain the meaning and pronunciation of each option. Do not claim domain, company-name or trademark availability; list checks the owner must perform.',output:'At least 15 name ideas grouped by naming style, tagline options, rationale and a screening checklist.',example:'Naming a modern digital education and creative services brand.'},
 {category:'Business Strategy',title:'Customer persona builder',purpose:'Describe useful customer segments based on evidence and explicit assumptions.',kind:'business',instruction:'Create practical customer personas from the supplied research, not stereotypes. Include goals, needs, context, objections, buying triggers, preferred information and accessibility considerations. Label any unsupported assumptions for validation.',output:'Two or three personas, their jobs-to-be-done, decision journey, objections and interview questions to validate them.',example:'Understanding first-time buyers of short online creative courses.'},
 {category:'Business Strategy',title:'Business operations and SOP',purpose:'Turn a repeatable task into a documented process people can follow.',kind:'business',instruction:'Write a standard operating procedure for the supplied business process. Define purpose, scope, owner, inputs, tools, numbered steps, decision points, quality checks, exceptions and records to keep. Include safe handling of customer information.',output:'A practical SOP, checklist, responsibility notes, exception-handling steps and a simple review schedule.',example:'A standard process for receiving, revising and delivering a client design project.'},
 {category:'Business Strategy',title:'Business pitch and elevator pitch',purpose:'Explain a venture clearly to customers, partners or potential supporters.',kind:'business',instruction:'Create a concise pitch for the stated audience. Explain the problem, target customer, solution, differentiation, evidence available, model and specific ask. Do not turn assumptions into traction or claim partnerships that are not confirmed.',output:'A 30-second pitch, a two-minute pitch, a one-sentence description and likely questions with grounded answers.',example:'Introducing a new online creative training service to a potential partner.'},
 {category:'Business Strategy',title:'Business budget and cash-flow plan',purpose:'Organise expected costs, cash inflows and financial assumptions for planning.',kind:'business',instruction:'Build a simple operating budget and cash-flow framework using the numbers supplied. Separate one-off setup costs, recurring costs, variable costs, expected receipts and timing. Highlight missing inputs and test conservative, base and optimistic scenarios without treating estimates as guaranteed.',output:'A budget table structure, monthly cash-flow view, assumptions list, break-even formula and key risk indicators.',example:'Planning a three-month launch budget for a small service business.'},

 {category:'Marketing & Sales',title:'Marketing campaign strategy',purpose:'Plan a campaign around one measurable goal, an audience and a clear offer.',kind:'business',instruction:'Design a marketing campaign from the supplied goal, offer, audience, channels, dates and budget. Include message strategy, creative concepts, content formats, calls to action, tracking and optimisation. Do not promise reach, sales or conversion rates.',output:'Campaign objective, audience, core message, channel plan, content concepts, timeline, budget assumptions and KPI dashboard.',example:'A two-week campaign introducing a new online course.'},
 {category:'Marketing & Sales',title:'Social media content calendar',purpose:'Build a balanced publishing plan with useful, varied content themes.',kind:'business',instruction:'Create a practical content calendar for the supplied platforms and posting capacity. Balance education, proof, community, product information and conversation. Include topic, format, hook, key message, CTA and production notes for each post.',output:'A four-week calendar in a table, three reusable content pillars and a simple review process.',example:'A month of posts for a small business offering digital creative services.'},
 {category:'Marketing & Sales',title:'Advertising copy variations',purpose:'Write clear ad copy for a specific offer and audience without misleading claims.',kind:'writing',instruction:'Create ad copy for the supplied offer and platform. Lead with a real customer problem or benefit, state what is included, use evidence only when provided, and end with a clear action. Avoid false scarcity, unsupported superlatives and guaranteed outcomes.',output:'Five headlines, three primary text variations, short descriptions and a compliance check of claims.',example:'An advert promoting a beginner video-editing course.'},
 {category:'Marketing & Sales',title:'Sales outreach message',purpose:'Start a relevant conversation with a prospective customer without spam or pressure.',kind:'writing',instruction:'Write a personalised outreach message based on a real observation about the prospect and a relevant service. Keep it brief, explain the possible value, ask one low-pressure question and respect a no or no reply. Do not invent familiarity or results.',output:'A first-contact message, one polite follow-up and a short personalisation checklist.',example:'Approaching a restaurant whose social media visuals could be made more consistent.'},
 {category:'Marketing & Sales',title:'Product launch plan',purpose:'Coordinate the preparation, announcement and follow-up of a new product or service.',kind:'business',instruction:'Build a launch plan with preparation, audience warm-up, launch-day actions and post-launch learning. Define owners, assets, channels, dependencies, customer support readiness, key dates and success measures.',output:'A launch timeline, deliverables checklist, message sequence, risk list and post-launch review questions.',example:'Launching a new digital course enrolment window.'},
 {category:'Marketing & Sales',title:'SEO content brief',purpose:'Prepare a useful search-focused content brief without keyword stuffing.',kind:'writing',instruction:'Create an SEO content brief for the supplied audience and search intent. Suggest a primary topic, related questions, title direction, heading outline, useful internal-link opportunities and original value to add. Do not invent search-volume numbers or claim guaranteed rankings.',output:'Search intent, keyword-theme suggestions, proposed title, heading outline, FAQ ideas, source requirements and on-page checklist.',example:'A guide for beginners comparing ways to learn graphic design online.'},
 {category:'Marketing & Sales',title:'E-commerce product listing',purpose:'Create an accurate product page that helps customers make an informed purchase.',kind:'writing',instruction:'Write a product listing using only the supplied product facts. Explain key benefits, specifications, use, sizing or compatibility where relevant, package contents, limitations and care instructions. Keep SEO language natural and avoid invented certifications or reviews.',output:'Product title, short description, detailed description, feature bullets, specification fields, FAQs and CTA.',example:'An online listing for a rechargeable desk lamp.'},
 {category:'Marketing & Sales',title:'Customer support response and FAQ',purpose:'Answer a customer question in a calm, useful and policy-aware way.',kind:'writing',instruction:'Draft a customer-support response using the verified policy and facts supplied. Acknowledge the concern, explain what is known, give safe next steps and escalate anything requiring account access or administrator approval. Never request passwords, OTPs or payment secrets.',output:'A ready-to-send response, internal handling checklist and three related FAQ entries.',example:'A learner asking why a purchased digital course is not yet visible.'},

 {category:'AI Image Creation',title:'Text-to-image creation',purpose:'Convert a written concept into a precise image-generation prompt from scratch.',kind:'image',instruction:'Create a detailed text-to-image prompt for an original image. Specify main subject, action, setting, composition, viewpoint, foreground and background, lighting, palette, textures, depth, visual style and aspect ratio. Keep important text out of the image unless the user explicitly asks for text.',output:'A main image prompt, optional negative prompt and suggested aspect ratio.',example:'A confident entrepreneur working in a bright contemporary studio.'},
 {category:'AI Image Creation',title:'Reference-image recreation',purpose:'Use an uploaded reference as a visual guide while preserving the requested appearance.',kind:'image-reference',instruction:'Create a reference-image prompt that starts by analysing the uploaded image. Preserve the subject’s visible identity and the appearance details the user asks to keep—such as facial features, hairstyle, clothing, proportions, pose, colours and distinctive objects. Change only the elements specifically requested. Do not claim an exact match is guaranteed.',output:'A reference-aware prompt, a preservation checklist, the requested-change list and a negative prompt for unwanted alterations.',example:'Place the same person from a supplied reference photo in a modern office while keeping their appearance consistent.'},
 {category:'AI Image Creation',title:'Professional product photography',purpose:'Create realistic product-photo directions for a clean catalogue or campaign visual.',kind:'image',instruction:'Write a product-photography generation prompt that respects the supplied product shape, colour, proportions, materials and branding. Specify studio or lifestyle setting, light placement, camera angle, lens feel, surface, shadows and crop. Do not invent product features or alter labels.',output:'A hero-shot prompt, an alternate lifestyle-shot prompt and a negative prompt for distortions or false branding.',example:'A premium skincare bottle photographed on a clean stone surface.'},
 {category:'AI Image Creation',title:'Poster and flyer design',purpose:'Plan a readable promotional graphic with clear information hierarchy.',kind:'image',instruction:'Create an image-generation prompt for a professional poster or flyer. Define the event or offer, audience, visual hierarchy, focal subject, colour palette, composition, negative space and exact text placement. Because image models may misspell text, provide a separate clean text layout for manual finishing.',output:'A visual prompt, an exact text-content block, hierarchy notes and a suggested portrait or landscape ratio.',example:'A premium purple-and-gold flyer announcing a digital skills workshop.'},
 {category:'AI Image Creation',title:'Logo and brand-identity concept',purpose:'Explore original visual identity directions based on a brand’s real purpose.',kind:'image',instruction:'Develop an original logo-concept prompt from the supplied brand name, sector, values and visual constraints. Focus on symbol concept, typography category, spacing, colour system, scalability and monochrome behaviour. Do not imitate an existing trademark or claim legal uniqueness.',output:'Three visual directions, a generation prompt for each, a palette description and a designer handoff checklist.',example:'A modern identity for a creative learning academy using a refined purple and gold palette.'},
 {category:'AI Image Creation',title:'Character design and consistency sheet',purpose:'Create a character reference that helps maintain consistent visual details across scenes.',kind:'image-reference',instruction:'Design an original character and a consistency sheet. Define age range where appropriate, silhouette, face and hair details, clothing, accessories, colour palette, proportions, personality cues and turnaround views. Keep the design original and make repeated scene prompts refer to the same approved character specification.',output:'A character description, front/side/back reference-sheet prompt, expression set and a reusable continuity block.',example:'An original friendly animated guide character for a beginner-learning video.'},
 {category:'AI Image Creation',title:'Image editing and inpainting',purpose:'Write a precise instruction for changing selected parts of an existing image.',kind:'image-reference',instruction:'Create an image-editing prompt for the supplied image and mask or selected region. State exactly what must change, what must remain untouched, how lighting and perspective should match, and how edges and textures should blend. Do not alter unrelated people, objects or identifying details.',output:'A concise edit instruction, a preserve-unchanged checklist and a negative prompt.',example:'Remove an unwanted object from a desk while retaining the room, person and lighting.'},
 {category:'AI Image Creation',title:'Background replacement',purpose:'Replace a background while keeping the foreground subject coherent.',kind:'image-reference',instruction:'Write a background-replacement prompt using the uploaded image as the subject reference. Preserve the subject’s requested appearance, pose, edges and scale. Describe the new environment, matching light direction, shadows, perspective, depth of field and colour temperature. Do not change the person or product unless asked.',output:'A replacement-background prompt, subject-preservation checklist and instructions for realistic edge blending.',example:'Keep a person unchanged while replacing a plain wall with a professional office environment.'},

 {category:'AI Video Creation',title:'Text-to-video cinematic scene',purpose:'Turn a text description into a time-based video-generation prompt.',kind:'video',instruction:'Write a text-to-video prompt with a clear subject, setting, action and sequence over time. Specify shot size, camera movement, lighting, motion speed, atmosphere, duration, aspect ratio and ending frame. Keep character, object and environment continuity physically plausible.',output:'A main video-generation prompt, a shot timeline, camera notes and negative constraints.',example:'A cinematic 8-second scene of a founder entering a sunlit creative studio.'},
 {category:'AI Video Creation',title:'Image-to-video animation',purpose:'Animate a still reference image while keeping its key visual details consistent.',kind:'image-video',instruction:'Create an image-to-video prompt using the uploaded image as the visual starting point. Preserve the subject, scene layout, clothing, colours and defining details. Describe only the intended movement, camera motion, environmental animation and duration. Avoid morphing, unrequested scene changes and identity drift.',output:'An image-to-video prompt, a movement timeline, camera instruction and negative prompt for unwanted changes.',example:'Animate a supplied portrait with a subtle natural head turn and gentle background movement.'},
 {category:'AI Video Creation',title:'Multi-shot video sequence',purpose:'Build several connected shots that feel like one coherent video.',kind:'video',instruction:'Create a multi-shot generation plan from the supplied story. For every shot define duration, subject, action, framing, camera movement, lighting and transition. Maintain consistent wardrobe, location, objects and character appearance. Specify how the last frame of one shot leads into the next.',output:'A shot-by-shot storyboard, separate generation prompts, continuity notes and an overall pacing plan.',example:'A 20-second sequence showing a product being prepared, used and presented.'},
 {category:'AI Video Creation',title:'Product promotional video',purpose:'Present a product through a short sequence of visual benefits and a clear offer.',kind:'video',instruction:'Plan a product promo using only the product details supplied. Show the product clearly, demonstrate real uses, select an appropriate setting, use purposeful camera movement and end with readable space for the CTA. Avoid fabricated product capabilities or unrealistic performance claims.',output:'A concept, timed shot list, video-generation prompts, voiceover or captions and final CTA frame.',example:'A 15-second mobile-first promo for a new desk accessory.'},
 {category:'AI Video Creation',title:'Explainer or tutorial video',purpose:'Teach a process visually with clear steps, narration and supportive graphics.',kind:'video',instruction:'Design an explainer video for the learner’s level. Break the topic into a hook, short explanation, numbered demonstrations, recap and next step. Describe visuals that make each step understandable and keep narration synchronised with the action.',output:'A complete storyboard, narration script, on-screen text, scene prompts and editing notes.',example:'A 60-second explainer showing the stages of writing an effective AI image prompt.'},
 {category:'AI Video Creation',title:'Vertical short-form video',purpose:'Create a concise, engaging vertical video for Reels, Shorts or similar formats.',kind:'video',instruction:'Build a vertical short-form video concept with an immediate truthful hook, one central idea, fast but understandable progression, captions and a relevant ending. Keep safe margins for platform interface overlays and specify 9:16 framing unless another ratio is requested.',output:'A 15–45 second script, timed shot list, caption text, visual-generation prompts and CTA.',example:'A 30-second tip video showing three ways to improve a business introduction.'},
 {category:'AI Video Creation',title:'Talking-avatar or presenter video',purpose:'Prepare a natural presenter script and visual setup for an avatar or talking-head tool.',kind:'video',instruction:'Create a natural presenter-video brief. Write speech for the requested duration, use short spoken sentences, plan pauses and emphasis, set a suitable camera framing and background, and identify where supporting visuals should appear. Do not impersonate a real person without permission.',output:'Presenter script, delivery notes, scene setup, subtitle text and supporting visual cues.',example:'A friendly presenter welcoming learners into an online course.'},
 {category:'AI Video Creation',title:'Video editing and post-production plan',purpose:'Turn raw footage into a structured edit with pacing, sound and visual consistency.',kind:'video',instruction:'Create an editing plan for the available footage and target platform. Define the opening, selects, clip order, pacing, transitions, captions, music, voiceover, colour treatment, sound cleanup and export settings. Do not suggest effects that obscure the message.',output:'A timeline or edit decision list, audio plan, graphics list, quality checklist and export recommendations.',example:'Editing a one-minute customer story from interview and workplace footage.'},
 {category:'AI Video Creation',title:'Whiteboard animation explainer',purpose:'Translate an educational idea into a sequence of simple drawn scenes.',kind:'video',instruction:'Create a whiteboard-animation storyboard that teaches one main idea. Use simple drawings, visual metaphors, progressive reveal, short narration and readable labels. Keep each scene uncluttered and make the drawing order support understanding.',output:'Scene-by-scene storyboard, narration, drawing instructions, transition cues and duration estimate.',example:'A 60-second whiteboard animation explaining how a small business attracts customers.'},

 {category:'Digital Products & Analysis',title:'Presentation and slide deck',purpose:'Plan a coherent presentation with one clear takeaway per slide.',kind:'design',instruction:'Create a presentation outline for the stated audience, purpose and time limit. Give every slide one central message, a concise title, supporting evidence or example, and a visual suggestion. Avoid overcrowded slides and invented data.',output:'A slide-by-slide outline, speaker notes, visual direction and a final takeaways slide.',example:'A 7-slide presentation introducing a new digital service to business partners.'},
 {category:'Digital Products & Analysis',title:'Website landing page',purpose:'Structure a landing page that explains an offer and guides visitors to the next step.',kind:'design',instruction:'Plan a mobile-first landing page for the supplied offer. Define audience, value proposition, hero, proof, benefits, process, FAQ, CTA and trust or privacy cues. Use only claims and testimonials that the business can substantiate.',output:'A page outline, headline options, section copy, CTA labels, FAQ and responsive design notes.',example:'A landing page for a beginner course in AI-powered creative work.'},
 {category:'Digital Products & Analysis',title:'App feature and user-flow design',purpose:'Translate a product need into a practical feature specification and user journey.',kind:'design',instruction:'Design a feature specification from the user problem. Define personas, goals, user stories, screen states, happy path, error cases, data needs, permissions, accessibility and acceptance criteria. Keep the first release focused and testable.',output:'Feature brief, user flow, screen inventory, acceptance criteria, edge cases and test plan.',example:'A student dashboard feature for saving and searching favourite prompts.'},
 {category:'Digital Products & Analysis',title:'Code generation and debugging assistant',purpose:'Help plan, write, explain or troubleshoot code with testable steps.',kind:'data',instruction:'Solve the supplied programming task using the stated language, framework and version. First identify assumptions and likely failure points, then provide maintainable code with comments, error handling and a minimal test plan. Do not invent APIs or claim code was executed unless it actually was.',output:'A concise diagnosis or implementation plan, complete code, setup notes, tests and known limitations.',example:'Debugging a JavaScript search filter that does not update the visible results.'},
 {category:'Digital Products & Analysis',title:'Spreadsheet and data analysis',purpose:'Organise data, build formulas and explain findings without overstating what the data proves.',kind:'data',instruction:'Analyse the supplied spreadsheet or dataset. Clarify column meaning and data quality, select appropriate formulas or summary methods, explain each calculation, identify missing values and distinguish correlation from causation. Do not invent figures that are not present.',output:'A clean analysis plan, formulas or steps, summary tables, key observations, caveats and recommended checks.',example:'Summarising monthly sales, costs and net profit for a small shop.'}
];

const taskOrder = [0,1,2,3,39,38,44,45,40,42,43,41,47,46,48,49,50,51,52,53,54,58,57,56,59,55,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,6,7,8,9,10,11,12,13,14,15,16,17,18,19,4,5];

const total = tasks.length * contexts.length * directions.length * providers.length;


function getItem(index){
  // Keep one card per platform for each prompt number in the combined view.
  // Filtering a platform therefore produces its own clean 1–15,000 sequence.
  const providerIndex = index % providers.length;
  const promptNumber = Math.floor(index / providers.length) + 1;
  const providerPromptIndex = promptNumber - 1;

  // Rotate through all 60 prompt families before moving to the next context/style.
  // This prevents hundreds of consecutive cards from repeating one prompt family.
  const taskSlot = providerPromptIndex % tasks.length;
  const variationSlot = Math.floor(providerPromptIndex / tasks.length);
  const contextIndex = variationSlot % contexts.length;
  const styleIndex = Math.floor(variationSlot / contexts.length);
  const taskIndex = taskOrder[taskSlot];
  const task = tasks[taskIndex];

  return {
    index:index,
    promptNumber:promptNumber,
    task:task,
    context:contextFor(task, contextIndex),
    direction:directions[styleIndex],
    provider:providers[providerIndex]
  };
}

function specialistGuide(kind){
  if(kind === 'music') return 'AUDIO PRODUCTION GUIDANCE: State genre, tempo or BPM range, mood, rhythm, instruments, vocal arrangement or instrumental status, song structure, dynamics, sound texture and ending. Keep the composition original; do not imitate a named artist or reproduce existing lyrics or melodies.';
  if(kind === 'image') return 'IMAGE GUIDANCE: Describe subject, action, environment, foreground, background, composition, viewpoint, lighting, colour palette, textures, lens feel, depth and aspect ratio. Add a separate negative prompt for unwanted objects, distortions or visual errors. Put any exact written wording in a separate text block for manual checking.';
  if(kind === 'image-reference') return 'REFERENCE IMAGE GUIDANCE: Ask the user to upload the reference if it is not attached. Analyse it first. Preserve the requested subject identity and visible attributes—face, hair, clothing, proportions, pose, colours and key objects—when the user asks to keep them. Change only what the brief names. Include a preservation checklist and negative directions; do not promise a perfect match.';
  if(kind === 'video' || kind === 'image-video') return 'VIDEO GUIDANCE: Organise the result by time or shot. Specify duration, subject action, opening and ending frame, camera framing and movement, environment, lighting, motion pace, aspect ratio, transitions and sound. Maintain continuity of people, clothing, props and locations. For image-to-video, treat the uploaded image as the visual starting frame and animate only the requested elements.';
  if(kind === 'business') return 'BUSINESS GUIDANCE: Separate supplied facts from assumptions. Show customer problem, value, resources, cost drivers, risks, validation steps and measurable next actions. Do not guarantee income, profit, customers, approval or business success.';
  if(kind === 'design') return 'DIGITAL DESIGN GUIDANCE: Prioritise a clear user goal, information hierarchy, accessibility, responsive behaviour, readable content and a coherent visual system. Describe the intended outcome and practical handoff details.';
  if(kind === 'data') return 'TECHNICAL GUIDANCE: State assumptions, explain the reasoning, handle errors, include test cases or validation steps, and identify version or data limitations. Never claim that code or calculations were executed or verified unless they actually were.';
  return 'WRITING GUIDANCE: Use accurate details, a logical structure and language appropriate to the reader. Keep missing names, dates, prices and factual details as editable placeholders. Do not invent credentials, testimonials, evidence or citations.';
}

function workflowFor(item){
  const kind = item.task.kind;
  if(kind === 'image-reference') return '1. Upload the reference image. 2. Identify the details that must stay unchanged. 3. List only the requested edits. 4. Generate or edit, then compare the result against the preservation checklist.';
  if(kind === 'image-video') return '1. Upload the starting image. 2. Define the motion and duration. 3. Set camera movement and scene continuity. 4. Generate the clip and review it for unwanted changes.';
  if(kind === 'video') return '1. Define the goal and audience. 2. Break the idea into timed shots. 3. Specify action, camera, lighting and sound. 4. Generate, review continuity and refine the final sequence.';
  if(kind === 'image') return '1. Describe the subject and purpose. 2. Set composition, lighting, colour and style. 3. Add details and avoid-list instructions. 4. Generate, inspect and refine the image.';
  if(kind === 'music') return '1. Set the theme and audience. 2. Choose genre, mood, tempo and instruments. 3. Arrange the sections and sound direction. 4. Generate or compose, then review originality and emotional flow.';
  if(kind === 'business') return '1. Identify the customer and problem. 2. Define the offer and resources. 3. Check costs, competition and risks. 4. Test demand with a small experiment before scaling.';
  if(kind === 'design') return '1. Define the user and desired outcome. 2. Organise the information or screen flow. 3. Set visual hierarchy and accessibility. 4. Review on mobile and desktop and refine.';
  if(kind === 'data') return '1. Inspect the supplied data or code. 2. Confirm assumptions and constraints. 3. Build the analysis or solution. 4. Test the result and explain limits or unresolved issues.';
  return '1. Identify the audience and purpose. 2. Gather the facts and required details. 3. Choose a suitable structure and draft. 4. Review accuracy, tone and completeness before using the final result.';
}

function buildPrompt(item){
  const t = item.task;
  const c = item.context;
  const d = item.direction;
  const p = item.provider;
  return [
    'ROLE: Act as an experienced ' + t.category.toLowerCase() + ' specialist and practical creative partner.',
    'TASK: ' + t.instruction,
    'PROJECT CONTEXT: Tailor the work to this context: ' + c.name + '. Example brief: ' + c.sample,
    'CREATIVE DIRECTION: ' + d.name + '. ' + d.detail,
    'DETAILS I WILL SUPPLY: [brand or project name] [audience] [goal] [location if relevant] [key facts or specifications] [reference files or images] [preferred format] [length or duration] [deadline or constraints].',
    'SPECIALIST PRODUCTION NOTES: ' + specialistGuide(t.kind),
    'EXPECTED DELIVERABLE: ' + t.output,
    'HOW IT WORKS: ' + workflowFor(item),
    'WORKING METHOD: First check whether the brief contains the information needed. If an essential detail is missing, ask up to three focused questions. Otherwise, state any important assumptions briefly and produce the requested result. Use clear sections and make the final deliverable easy to copy.',
    'QUALITY CHECK: Keep the work original, useful, audience-appropriate and consistent with the supplied facts. Do not fabricate names, statistics, credentials, customer testimonials, product capabilities, sources or results. Flag any factual statement that needs verification. Respect privacy, permissions and applicable platform rules.',
    'PLATFORM-SPECIFIC NOTE — ' + p.name + ': ' + p.guidance
  ].join('\n\n');
}

function matches(item, query, chosenProvider, chosenCategory, chosenStyle){
  if(chosenProvider !== 'all' && item.provider.name !== chosenProvider) return false;
  if(chosenCategory !== 'all' && item.task.category !== chosenCategory) return false;
  if(chosenStyle !== 'all' && item.direction.name !== chosenStyle) return false;
  if(!query) return true;
  const contextName = typeof item.context?.name === 'string' ? item.context.name : '';
  const contextSample = typeof item.context?.sample === 'string' ? item.context.sample : '';
  const haystack = [item.provider.name,item.task.title,item.task.category,item.task.purpose,contextName,contextSample,item.direction.name].join(' ').toLowerCase();
  return haystack.indexOf(query) !== -1;
}



Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ success: false, error: "Origin not allowed." }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(origin) });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405, origin);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ success: false, error: "Please sign in to continue." }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) {
    console.error("Prompt library environment configuration is incomplete.");
    return json({ success: false, error: "The prompt service is temporarily unavailable." }, 503, origin);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user || !(user.email_confirmed_at || user.phone_confirmed_at)) {
    return json({ success: false, error: "A verified DCDS student account is required." }, 401, origin);
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", COURSE_SLUG)
    .maybeSingle();

  if (courseError || !course) {
    console.error("Prompt course lookup failed.", courseError?.message ?? "Course not found");
    return json({ success: false, error: "The prompt course is not currently available." }, 503, origin);
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();

  if (enrollmentError) {
    console.error("Prompt course enrolment lookup failed.", enrollmentError.message);
    return json({ success: false, error: "We could not verify your course enrolment. Please try again." }, 503, origin);
  }

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc("is_dcds_admin");
  if (adminCheckError) {
    console.error("DCDS administrator check failed.", adminCheckError.message);
    return json({ success: false, error: "We could not verify your DCDS access. Please try again." }, 503, origin);
  }

  if (!enrollment && isAdmin !== true) {
    return json({ success: false, error: "You are not enrolled in Access to ChatGPT Prompts, Claude, Gemini, and Grok." }, 403, origin);
  }

  const accessRole = isAdmin === true ? "admin_preview" : "enrolled_student";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "A valid JSON request is required." }, 400, origin);
  }

  const pageNumber = Number(body.page ?? 1);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 4000) {
    return json({ success: false, error: "Invalid prompt page." }, 400, origin);
  }

  const rawSearch = typeof body.search === "string" ? body.search.trim() : "";
  if (rawSearch.length > 120) return json({ success: false, error: "Search text is too long." }, 400, origin);
  const query = rawSearch.toLowerCase();

  const providerFilter = typeof body.provider === "string" ? body.provider : "all";
  if (providerFilter !== "all" && !providers.some((p) => p.name === providerFilter)) {
    return json({ success: false, error: "Choose a valid AI platform." }, 400, origin);
  }

  const categoryFilter = typeof body.category === "string" ? body.category : "all";
  const categories = Array.from(new Set(tasks.map((t) => t.category)));
  if (categoryFilter !== "all" && !categories.includes(categoryFilter)) {
    return json({ success: false, error: "Choose a valid prompt category." }, 400, origin);
  }

  const styleFilter = typeof body.style === "string" ? body.style : "all";
  const styles = directions.map((d) => d.name);
  if (styleFilter !== "all" && !styles.includes(styleFilter)) {
    return json({ success: false, error: "Choose a valid creative direction." }, 400, origin);
  }

  const pageStart = (pageNumber - 1) * PAGE_SIZE;
  const items: Array<Record<string, unknown>> = [];
  let totalMatches = 0;

  for (let i = 0; i < total; i++) {
    const item = getItem(i);
    if (!matches(item, query, providerFilter, categoryFilter, styleFilter)) continue;

    if (totalMatches >= pageStart && items.length < PAGE_SIZE) {
      items.push({
        index: item.index,
        promptNumber: item.promptNumber,
        task: item.task,
        context: item.context,
        direction: item.direction,
        provider: item.provider,
        workflow: workflowFor(item),
        prompt: buildPrompt(item)
      });
    }
    totalMatches++;
  }

  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));
  if (pageNumber > totalPages && totalMatches > 0) {
    return json({ success: false, error: "That prompt page is beyond the available results." }, 400, origin);
  }

  return json({
    success: true,
    accessRole,
    total: totalMatches,
    page: pageNumber,
    pageSize: PAGE_SIZE,
    totalPages,
    categories,
    directions: styles,
    items
  }, 200, origin);
});

/**
 * Testimonial data — verbatim from the reference site config (bundles/1874 `testimonials` array),
 * grouped into the 5 marquee columns exactly as captured in structure.json.
 * Avatars use the locally mirrored files in public/api/portraits (download-log.json).
 */

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  /** Local mirrored avatar (public/api/portraits/...). */
  img: string;
  /** Quote text before the highlighted span. */
  quote: string;
  /** Highlighted span text (renders in text-secondary). */
  highlight: string;
  /** Optional trailing text after the highlight. */
  after?: string;
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    name: "Alex Rivera",
    role: "CTO at InnovateTech",
    img: "/api/portraits/men/91.jpg",
    quote:
      "The AI-driven analytics from #QuantumInsights have revolutionized our product development cycle.",
    highlight: "Insights are now more accurate and faster than ever.",
    after: "A game-changer for tech companies.",
  },
  {
    id: "2",
    name: "Samantha Lee",
    role: "Marketing Director at NextGen Solutions",
    img: "/api/portraits/women/12.jpg",
    quote:
      "Implementing #AIStream's customer prediction model has drastically improved our targeting strategy.",
    highlight: "Seeing a 50% increase in conversion rates!",
    after: "Highly recommend their solutions.",
  },
  {
    id: "3",
    name: "Raj Patel",
    role: "Founder & CEO at StartUp Grid",
    img: "/api/portraits/men/45.jpg",
    quote:
      "As a startup, we need to move fast and stay ahead. #CodeAI's automated coding assistant helps us do just that.",
    highlight: "Our development speed has doubled.",
    after: "Essential tool for any startup.",
  },
  {
    id: "4",
    name: "Emily Chen",
    role: "Product Manager at Digital Wave",
    img: "/api/portraits/women/83.jpg",
    quote:
      "#VoiceGen's AI-driven voice synthesis has made creating global products a breeze.",
    highlight: "Localization is now seamless and efficient.",
    after: "A must-have for global product teams.",
  },
  {
    id: "5",
    name: "Michael Brown",
    role: "Data Scientist at FinTech Innovations",
    img: "/api/portraits/men/1.jpg",
    quote:
      "Leveraging #DataCrunch's AI for our financial models has given us an edge in predictive accuracy.",
    highlight: "Our investment strategies are now powered by real-time data analytics.",
    after: "Transformative for the finance industry.",
  },
  {
    id: "6",
    name: "Linda Wu",
    role: "VP of Operations at LogiChain Solutions",
    img: "/api/portraits/women/5.jpg",
    quote:
      "#LogiTech's supply chain optimization tools have drastically reduced our operational costs.",
    highlight: "Efficiency and accuracy in logistics have never been better.",
  },
  {
    id: "7",
    name: "Carlos Gomez",
    role: "Head of R&D at EcoInnovate",
    img: "/api/portraits/men/14.jpg",
    quote:
      "By integrating #GreenTech's sustainable energy solutions, we've seen a significant reduction in carbon footprint.",
    highlight: "Leading the way in eco-friendly business practices.",
    after: "Pioneering change in the industry.",
  },
  {
    id: "8",
    name: "Aisha Khan",
    role: "Chief Marketing Officer at Fashion Forward",
    img: "/api/portraits/women/56.jpg",
    quote:
      "#TrendSetter's market analysis AI has transformed how we approach fashion trends.",
    highlight: "Our campaigns are now data-driven with higher customer engagement.",
    after: "Revolutionizing fashion marketing.",
  },
  {
    id: "9",
    name: "Tom Chen",
    role: "Director of IT at HealthTech Solutions",
    img: "/api/portraits/men/18.jpg",
    quote:
      "Implementing #MediCareAI in our patient care systems has improved patient outcomes significantly.",
    highlight: "Technology and healthcare working hand in hand for better health.",
    after: "A milestone in medical technology.",
  },
  {
    id: "10",
    name: "Sofia Patel",
    role: "CEO at EduTech Innovations",
    img: "/api/portraits/women/73.jpg",
    quote:
      "#LearnSmart's AI-driven personalized learning plans have doubled student performance metrics.",
    highlight: "Education tailored to every learner's needs.",
    after: "Transforming the educational landscape.",
  },
  {
    id: "11",
    name: "Jake Morrison",
    role: "CTO at SecureNet Tech",
    img: "/api/portraits/men/25.jpg",
    quote:
      "With #CyberShield's AI-powered security systems, our data protection levels are unmatched.",
    highlight: "Ensuring safety and trust in digital spaces.",
    after: "Redefining cybersecurity standards.",
  },
  {
    id: "12",
    name: "Nadia Ali",
    role: "Product Manager at Creative Solutions",
    img: "/api/portraits/women/78.jpg",
    quote:
      "#DesignPro's AI has streamlined our creative process, enhancing productivity and innovation.",
    highlight: "Bringing creativity and technology together.",
    after: "A game-changer for creative industries.",
  },
  {
    id: "13",
    name: "Omar Farooq",
    role: "Founder at Startup Hub",
    img: "/api/portraits/men/54.jpg",
    quote:
      "#VentureAI's insights into startup ecosystems have been invaluable for our growth and funding strategies.",
    highlight: "Empowering startups with data-driven decisions.",
    after: "A catalyst for startup success.",
  },
];

/** Column order/durations as captured: 40s, 60s, 30s, 70s, 40s. */
export const testimonialColumns: Testimonial[][] = [
  testimonials.slice(0, 3),
  testimonials.slice(3, 6),
  testimonials.slice(6, 9),
  testimonials.slice(9, 12),
  testimonials.slice(12, 13),
];

export const testimonialDurations = ["40s", "60s", "30s", "70s", "40s"];

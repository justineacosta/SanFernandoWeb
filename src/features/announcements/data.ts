import type { Announcement, NewsArticle } from "@/types";

export const FEATURED_ARTICLE: NewsArticle = {
  title: "Annual Barangay Health Mission: Serving Over 500 Residents",
  category: "Health & Wellness",
  excerpt:
    "The Barangay San Fernando council, in collaboration with the Municipal Health Office, successfully concluded its 3-day health mission providing free consultations, medicines, and dental services to the community.",
  image:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDQ1ENg0K93q5ytb5OOTgJEY55sIn8nMDOlzJU0htQWmrd7zczGG0qK3G2pZit_pe52gsn8nXZuxFE3GpmYY2BKwIjjlkUW2TZs7B4OAQifFp9FnEGJqEqFQC4DT0kz3KsKbgnHClpLUwgNYUZEVeq4a8EGE_M-7wIlojSNb2nkeAe5yarhLzxsXDrgW7wa--fNBMYQXPZm3dDe3mK68fUwJzVXjyXjfv7HNFtKclIKYXXGmAuF2k49XRRuQ3mDJxIAv7d1Ay4N0ps",
  imageAlt: "Medical professionals providing checkups during a community health mission",
  dateLabel: "Oct 24, 2024",
  author: "Admin Office",
  featured: true,
};

export const NEWS_ARTICLES: NewsArticle[] = [
  {
    title: "Q4 Town Hall Meeting: Budget Presentation",
    category: "Governance",
    excerpt:
      "Join us this coming Saturday for the final quarterly report of the year. Transparency in every peso spent.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD6ma96iTbXpL5D8iY00jdQna9_E9Zc9Sz1zRrMTSnNzYAJ8lNmcAZsfdiG3Wyla4IeN5jMONdFhBJlFLpuFfF_TfK_XNjhhgv0CPkqQFbPj6gcrjAaA2_BI1MxwU8erS0Nev1byXqKmBW3krm_NWuIq4WiwGzViYZx3m4q2Hf1FudxjQVYKWDp7thYZJATFUhyPY9ADPr20voWQ8YrCleK1uzP0mlrHUCLZh3bFarIDDLdXiq6fyBtcKmqyhE8mgNMjeWwhiG4n0Q",
    imageAlt: "Residents attending a town hall meeting",
    dateLabel: "2 days ago",
  },
  {
    title: "Green San Fernando: Tree Planting Drive",
    category: "Environment",
    excerpt:
      "Over 100 seedlings were planted along the riverside as part of our climate resilience initiative.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA-DyS7lqlQDwEm2qpytdfuo-xlsf0GzLuTmdrJcxLAhT6yyg4EOtyQ4M6hnBO4G0IS-Kcs3MNwEK3pUCk9j3re7tJgHB45Mh5l4vAMU_Qq83BgZ31mSftlpO5cpPG3NCuzWWwHsEo-S1Kt9lB4SzMjfCMTVXJksgFz_Q1IGK1aDhxAtAAQvLaVCMF7lslaG3XIkdRBHkML-6ZF2Ooh80Yq6fPP0-_GIjq0dThSjfEeIhPzXyZrqPkbFn7izXoWPe8tnlQCzK6g0IM",
    imageAlt: "Volunteers planting trees in a local park",
    dateLabel: "Oct 20, 2024",
  },
];

export const SIDEBAR_ANNOUNCEMENTS: Announcement[] = [
  {
    title: "Scheduled Power Interruption",
    date: "2024-10-26",
    excerpt: "Maintenance works by Meralco on Zones 4 and 5 from 8:00 AM to 5:00 PM.",
    urgent: true,
  },
  {
    title: "Voter Registration Day",
    date: "2024-10-28",
    excerpt: "Final satellite registration for SK and Local Elections at the Multi-purpose Hall.",
  },
  {
    title: "All Souls Day Traffic Advisory",
    date: "2024-11-02",
    excerpt: "One-way traffic scheme will be implemented near the public cemetery.",
  },
];

export const SIDEBAR_HOTLINES = [
  { label: "National Emergency", number: "911", tone: "danger" as const },
  { label: "Barangay Police", number: "(02) 8888-0000", tone: "secondary" as const },
  { label: "Health Center", number: "(02) 8888-1111", tone: "secondary" as const },
];

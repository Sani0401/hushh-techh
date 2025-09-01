const questions = {
  personalPreferences: {
    sections: [
      {
        title: "Habits and Lifestyle",
        questions: [
          { id: "smoke", text: "Do you smoke?", type: "text" },
          { id: "alcohol", text: "Do you drink alcohol?", type: "text" },
          { id: "exercise", text: "How often do you exercise?", type: "text" },
          { id: "wake_time", text: "What time do you usually wake up?", type: "text" },
          { id: "day_type", text: "Are you more of a morning or night person?", type: "choice", options: ["Morning", "Night"] },
          { id: "diet", text: "What's your diet like?", type: "text" }
        ]
      },
      {
        title: "Beliefs and Virtues",
        questions: [
          { id: "political_beliefs", text: "What are your political beliefs?", type: "text" },
          { id: "religion_importance", text: "How important is religion to you?", type: "scale", min: 1, max: 5 },
          { id: "social_life", text: "What kind of social life do you enjoy?", type: "text" },
          { id: "personality", text: "Are you an introvert or extrovert?", type: "choice", options: ["Introvert", "Extrovert", "Ambivert"] }
        ]
      },
      {
        title: "Fashion",
        questions: [
          { id: "brands", text: "What clothing brands do you usually shop from?", type: "text" },
          { id: "shopping_pref", text: "Do you prefer shopping online or in-store?", type: "choice", options: ["Online", "In-store", "Both"] },
          { id: "style", text: "How would you describe your style?", type: "text" },
          { id: "brand_choice", text: "What matters most to you when choosing a brand?", type: "text" }
        ]
      },
      {
        title: "Interests and Hobbies",
        questions: [
          { id: "top_hobbies", text: "What are your top 3 hobbies?", type: "text" },
          { id: "new_hobby", text: "What's a hobby you've recently picked up?", type: "text" }
        ]
      },
      {
        title: "Travel",
        questions: [
          { id: "travel_love", text: "Do you like to travel?", type: "choice", options: ["Yes", "No", "Sometimes"] },
          { id: "travel_preference", text: "Are you more of a beach or mountains person?", type: "choice", options: ["Beach", "Mountains", "Both"] }
        ]
      }
    ]
  }
};

export default questions;

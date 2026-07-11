export type IntentType = 'new-image' | 'wardrobe' | 'animate' | 'translate';

export interface ParsedIntent {
  intent: IntentType;
  prompt?: string;
  description?: string; // wardrobe/apparel description
  voiceover?: string;   // voiceover text for animations
  language?: 'Hindi' | 'Kannada'; // target translation language
}

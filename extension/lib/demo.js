import { normalizeItem } from './model.js';
const seeds = [
  ['Design', 'The small design details that make everyday things feel better', 'A collection of thoughtful details: the slight curve on a handle, a label exactly where you need it, and the quiet satisfaction of something that just works.', 2480, 'Discussion'],
  ['LearnProgramming', 'The missing guide to actually finishing your side projects', 'Start with the smallest useful thing. Ship it. Then let real use tell you what to build next. Here are the habits that helped me finally get projects out of the ideas folder.', 1806, 'Resource'],
  ['books', 'What book made you slow down and see the world differently?', 'Looking for the kind of book you keep thinking about long after the last page. Fiction, essays, poetry — I would love to hear what stayed with you.', 943, 'Recommendation'],
  ['BuyItForLife', 'A decade later, these are the things I would buy again', 'A well-made backpack, a cast iron pan, and a surprisingly ordinary desk lamp. My short list of things that have earned their space over the last ten years.', 3260, 'Review'],
  ['productivity', 'A simpler way to keep track of everything you want to learn', 'Instead of another elaborate system, I keep one list of questions. Each week I pick one and spend an hour following my curiosity. That is the whole system.', 674, 'Advice'],
  ['Design', 'A field guide to typography you notice without noticing', 'Letter spacing on a street sign. A generous margin in a paperback. Why some pages feel calm before you have even read a word.', 1210, 'Typography'],
  ['Cooking', 'The little techniques that made the biggest difference in my cooking', 'Salt in layers, give the pan time to heat up, and taste before serving. Sharing the small lessons that made cooking at home a lot more enjoyable.', 2145, 'Discussion'],
  ['LearnProgramming', 'How I finally understood async and await', 'Think of it as pausing a recipe while the oven warms up. You can get on with other things in the meantime. This explanation finally made it click for me.', 856, 'Guide'],
  ['books', 'A reading list for a rainy weekend', 'Short novels, long essays, and a few books to get wonderfully lost in. Collected from the recommendations in last week’s thread.', 418, 'Book list'],
  ['CozyPlaces', 'My little reading corner, slowly coming together', 'A secondhand chair, a warm lamp, and a stack of books. Sometimes the best space is the one you make with what you already have.', 4520, 'Home'],
  ['productivity', 'Leave yourself a starting point for tomorrow', 'Before you finish work, write down the next small step. Not a huge goal — just the first thing you can do. Removing that tiny bit of friction makes a surprising difference.', 1332, 'Tip'],
  ['Cooking', 'Your favorite meals that use just one pot', 'The best answers in this thread are the ones with almost no washing up. Saving this for the evenings when cooking feels like a big ask.', 986, 'Question'],
  ['BuyItForLife', 'What is the most useful thing you have repaired instead of replaced?', 'My old headphones are on their third set of ear pads and still going strong. Curious what other people have given a second life.', 728, 'Discussion'],
  ['CozyPlaces', 'A quiet morning at the cabin', 'Coffee, an open window, and no plans for the afternoon. A reminder to make a little room for doing nothing.', 2710, 'Outdoors'],
  ['Design', 'Useful resources for learning color theory', 'A few practical exercises that make more sense than memorizing a color wheel. Start by collecting palettes from things you like in the real world.', 596, 'Resource'],
  ['LearnProgramming', 'A kind reminder: reading code is practice too', 'You do not need to write something new every day. Take a small project, follow the data, and change one thing. Understanding someone else’s choices is a skill.', 1590, 'Discussion'],
  ['books', 'The case for rereading your favorite books', 'A book changes because you do. Coming back to an old favorite can feel like a conversation with a previous version of yourself.', 832, 'Discussion'],
  ['productivity', 'Give your bookmarks a second life', 'Saving is only the first step. Every Sunday I open three things I saved, read them, and decide whether I want to keep them. A tiny ritual for a growing collection.', 402, 'Tip']
];
export function demoLibrary() {
  return { version: 1, account: 'demo_reader', lastSync: null, fetched: seeds.length, items: seeds.map(([subreddit, title, body, score, flair], i) => normalizeItem({
    id: `${i === 7 || i === 10 || i === 15 ? 't1' : 't3'}_demo${i}`, subreddit, title, body, score, flair,
    author: ['smallgoodthings', 'curious_by_default', 'weekendreader', 'made_to_last'][i % 4],
    permalink: `/r/${subreddit}/comments/demo${i}/example/`, comments: 23 + i * 11,
    created: Date.UTC(2026, 8, 11 - i * 3) / 1000, favorite: [0, 2, 5, 9].includes(i), read: [3, 6, 8, 12, 16].includes(i)
  }, i)) };
}

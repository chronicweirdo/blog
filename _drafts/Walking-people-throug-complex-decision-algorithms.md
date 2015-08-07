---
layout: post
title:  'Walking through complex decision algorithms'
date:   2015-08-04 09:30:00
tags: ['information management', 'presentation', 'javascript']
---
There are times when you have to implement complex, many step decision based algorithms. These are not the most elegant pieces of code you'll write and you'll have to be careful and keep you code as clean and simple as possible. Don't do nest if clauses on multiple levels, split your code in multiple methods, keep your methods short, give them clear, suggestive names. These are some guidelines on how to keep your code manageable, but I'm not going to talk about this here. Instead, I want to discuss another problem I have run into when implementing such an algorithm. How do I explain what the algorithm is doing to other people in today's short attention-span world? How do I make this explanation simple and easy to follow. Also, how do I write a document that is easy to update as the algorithm changes with time?

The usual way of representing such an algorithm is with a decision tree. You have a start point, the root, and each node asks a question. Each branch leaving a node is an answer to the question posted in the node. You follow a path in the tree by choosing the answer to each question you come upon and taking that answer's branch until you reach the final result of the algorithms, a leaf in the tree. Here's a tree:

<p class="image">
    <img src="/assets/2015.08/icecream_simple.png" alt="Simple ice cream decision graph" />
</p>

Now you'll know if you should eat ice cream by answering the question in the node and following the answer branch to the algorithm result. But it's not always that easy. If such an algorithm is or becomes more complex, it's decision tree grows. Soon, you won't be able to fit that tree in a single page. You'll have to split it into multiple pages or screens. Each time a change must be made to the algorithm, you have to find all the places in the tree that are affected and edit them. And have you ever solved a printed labyrinth? This decision tree is starting to look like one and if you make a mistake along you path you'll reach some unexpected answer and end up more confused about what this algorithm is doing. Do you still want that ice cream?


Should you eat ice-cream?

Are you hungry?
Y
N

Do you like to gorge yourself?
Y
N

How much do you like ice cream?
A lot.
Very much.
Meh.
I hate it!

Do you care about your figure?
Y
N

Did you just accomplish something amazing and you deserve a reward?
Y
N

You didn't really accomplish anything, but it's Friday afternoon, it's been a long week and life is too short and you should enjoy it?
Y
N



Cram that ice cream in your face!

You should probably not eat ice cream.

What I'm saying is that there may be a better way to present your algorithm. Easier to manage than a decision tree and easier to follow by the person reading it. It's also easy to build as you go over the code of your algorithm. I am refering to a wizard-like presentation. The presentation will have a page for each question you ask. The page also contains all the possible answers for that questions as buttons. You read the question, choose the correct answer for the current situation and click the corresponding button. The presentation then moves to the next page, containing the next question or, if you reached the end, the answer that the algorithm provides. This way, one can go over the algorithm step by step and experiment with different inputs to gain a better understanding of how a decision is reached. The presentation shows a single question at a time so it is easy to remain focused instead of being overwhelmed by the labyrinth you still have to follow to reach your answer. In addition to showing the current question, you can also keep all previous questions on screen and highlight the answers that were chosen. If you do this, once an answer is reached, the reader can look at all the previous steps and review the path that brought them to this answer.

This presentation approach is just a tool to help with understanding the working of complex algorithms without having to look at the implementation. I think this is a good alternative to a decision tree, easier to follow and also maintain.

An implementation
---

This presentation method is easy to implement in HTML. I've implemented this using HTML and plain JavaScript (no frameworks) and embedded it into Confluence pages. I'll implement the "Ice cream consumption" decision tree, show you the JavaScript code and the structure of presentation pages and also embed the final version of the decision tree for you to test out (and to verify that it's easy to embed anywhere).

---
layout: post
title:  'Walking through complex decision algorithms'
date:   2015-08-07 19:40:00
tags: ['information management', 'presentation', 'javascript']
excerpt: How to document and explain complex decision algorithms.
---
There are times when you have to implement complex, many step decision based algorithms. These are not usually part of the most elegant code you'll write and you'll have to be careful and keep you code as clean and as simple as possible. Don't nest if clauses on multiple levels, split your code in multiple methods, keep your methods short, give them clear, suggestive names. These are some guidelines on how to keep your code manageable, but I'm not going to talk about implementation guidelines here. Instead, I want to discuss another problem I have run into when writing these kinds of algorithms. How do I explain what the algorithm is doing to other people in today's short-attention-spanned world? How do I make this explanation simple and easy to follow? Also, how do I write a document that is easy to update as the algorithm changes?

The usual way of representing such an algorithm is with a decision tree. You have a start point, the root, and each node asks a question. Each branch leaving a node is an answer to the question posted in the node. You follow a path in the tree by choosing the answer to each question you come upon and taking that answer's branch until you reach the final result of the algorithm, a tree leaf. Here's a tree to help you decide if you should eat ice cream:

<p class="image">
    <img src="/assets/2015.08/icecream_simple.png" alt="Simple ice cream decision graph" />
</p>

Now you'll know if you should eat ice cream by answering the question in the node and following the answer branch to the algorithm result. But it's not always that easy. If such an algorithm is or becomes more complex, its decision tree grows. Soon, you won't be able to fit that tree in a single page. You'll have to split it into multiple pages or screens. Each time a change must be made to the algorithm, you have to find all the places in the tree that are affected and edit them. And have you ever solved a printed labyrinth? This decision tree is starting to look like one, and if you make a mistake along your path you'll reach some unexpected answer and end up more confused about what the algorithm is doing than when you stated. Do you still want that ice cream?

<p class="image">
    <img src="/assets/2015.08/icecream_complicated.png" alt="Complicated ice cream decision graph" />
</p>

In this post I'm exploring what may be a better way to present your algorithm. Easier to manage than a decision tree and easier to follow by the person reading it. It's also easy to build as you go over the code of your algorithm. I am referring to a wizard-style presentation. The presentation will have a page for each question you ask. The page also contains all the possible answers for that question as buttons. You read the question, choose the correct answer for the current situation and click the corresponding button. The presentation then moves to the next page, containing the next question or, if you reached the end, the answer that the algorithm provides. This way, one can go over the algorithm step by step and experiment with different inputs to gain a better understanding of how a decision is reached. The presentation shows a single question at a time so it is easy to remain focused instead of being overwhelmed by the labyrinth you still have to follow to reach your answer. In addition to showing the current question, you can also keep all previous questions on screen and highlight the answers that were chosen. If you do this, once an answer is reached, the reader can look at all the previous steps and review the path that brought them to that answer.

This presentation approach is just a tool to help one understand how a complex algorithm works without having to look at the implementation. I think this is a good alternative to a decision tree, easier to follow and also easier to maintain.

An implementation
---

This presentation method is easy to implement in HTML. I've implemented this using HTML and plain JavaScript (no frameworks) and embedded it into Confluence pages. I'll implement the "Ice cream consumption" decision tree, show you the JavaScript code and the structure of presentation pages and also embed the final version of the decision tree for you to test out (and for me to verify that it's easy to embed anywhere).

Starting with the structure of our data, we define each step in a paragraph. It's important to have a class identifying the steps/nodes in the tree and a unique ID for each step. We then show the question and list the possible answers as buttons. Each button calls a JavaScript function. We also specify the next step and provide a reference to the button that was pushed. We also want to make all step elements invisible except for the first step. Here are the first two steps as paragraphs:

~~~ html
<p class="step" id="stepHungry" style="display: block;">
    <span class="border">
        Are you hungry?<br />
        <button onclick="goto('stepFigure', this)">YES</button>
        <button onclick="goto('stepGorge', this)">NO</button>
    </span>
</p>
<p class="step" id="stepFigure">
    <span class="border">
        Do you care about your figure?<br />
        <button onclick="goto('stepAccomplishment', this)">YES</button>
        <button onclick="goto('stepIcecream', this)">NO</button>
    </span>
</p>
~~~

As for the required JavaScript, the **goto** function receives the next step and a reference to the button that was pushed as arguments. We need the next step to know where to go next. As for a reference to the button, we need it because the JavaScrip **this** value is set to the window object when we assign event handlers through an element attribute. We need to know which answer was selected because we want to highlight it. With all previous answers displayed and highlighted the reader can easily see what decisions they made to end up with some answer.

The function highlights the button that was clicked, disables all buttons to prevent users from clicking them again and makes the next step visible.

~~~ javascript
function goto(show, button) {
    if (button) {
        var sourceDiv = findParentStep(button);
        var answers = sourceDiv.querySelectorAll("button");
        for (var index = 0; index < answers.length; index++) {
            var answer = answers[index];
            if (answer == button) {
                answer.className = "selected";
            } else {
                answer.className = "notSelected";
            }
            answer.disabled = true;
        }
    }
    document.getElementById(show).style.display = "block";
}
~~~

We also have a reset function that can be executed once an answer was reached. This function will bring all steps and buttons to their original state. For more details, see the source of the demonstration section of this page.

A demonstration
---

Now you have a practical way of figuring out if you should eat that ice cream. Try it out!

<style>
    .step {
        display: none;
        text-align: center;
    }
    .border {
        display: inline-block;
        border: 1px solid black;
        padding: 2%;
        margin-bottom: 10px;
        width: 90%;
    }
    button.selected {
        background-color: blue;
        color: white;
    }
	.success {
		background-color: #66FF99;
	}
	.fail {
		background-color: #FF9999;
	}
</style>
<script>
    function goto(show, button) {
        if (button) {
            var sourceDiv = findParentStep(button);
            var answers = sourceDiv.querySelectorAll("button");
            for (var index = 0; index < answers.length; index++) {
                var answer = answers[index];
				if (answer == button) {
                    answer.className = "selected";
                } else {
                    answer.className = "notSelected";
                }
                answer.disabled = true;
            }
        }
        document.getElementById(show).style.display = "block";
        window.scrollTo(0,10000);
    }
    function findParentStep(button) {
        var step = button.parentNode;
        while (step) {
            if (step.className.indexOf('step') > -1) {
                return step;
            }
            step = step.parentNode;
        }
        return step;
    }
    function reset(show, regex) {
        var steps = document.querySelectorAll(".step");
        for (var index = 0; index < steps.length; index++) {
            var step = steps[index];
            if (regex) {
                if (regex.test(step.getAttribute("id"))) {
                    step.style.display = "none";
                    resetButtons(step);
                }
            } else {
                step.style.display = "none";
                resetButtons(step);
            }
        }
        document.getElementById(show).style.display = "block";
    }
    function resetButtons(step) {
        var buttons = step.querySelectorAll("button");
        for (var buttonIndex = 0; buttonIndex < buttons.length; buttonIndex++) {
            var button = buttons[buttonIndex];
            button.disabled = false;
            button.className = "";
        }
    }
</script>
<p class="step" id="stepHungry" style="display: block;">
    <span class="border">
        Are you hungry?<br />
        <button onclick="goto('stepFigure', this)">YES</button>
        <button onclick="goto('stepGorge', this)">NO</button>
    </span>
</p>
<p class="step" id="stepFigure">
    <span class="border">
        Do you care about your figure?<br />
        <button onclick="goto('stepAccomplishment', this)">YES</button>
        <button onclick="goto('stepIcecream', this)">NO</button>
    </span>
</p>
<p class="step" id="stepAccomplishment">
    <span class="border">
        Did you just accomplish something amazing and you deserve a reward?<br />
        <button onclick="goto('stepIcecream', this)">YES</button>
        <button onclick="goto('stepFriday', this)">NO</button>
    </span>
</p>
<p class="step" id="stepFriday">
    <span class="border">
        You didn't really accomplish anything, but it's Friday afternoon, it's been a long week and life's too short and you should enjoy it?<br />
        <button onclick="goto('stepIcecream', this)">YES</button>
        <button onclick="goto('stepIcecream', this)">MAYBE</button>
        <button onclick="goto('stepIcecream', this)">PROBABLY</button>
    </span>
</p>
<p class="step" id="stepGorge">
    <span class="border">
        Do you like to gorge yourself?<br />
        <button onclick="goto('stepIcecream', this)">YES</button>
        <button onclick="goto('stepFailure', this)">NO</button>
    </span>
</p>
<p class="step" id="stepIcecream">
    <span class="border">
        How much do you like ice cream?<br />
        <button onclick="goto('stepSuccess', this)">A LOT</button>
        <button onclick="goto('stepSuccess', this)">VERY MUCH</button>
        <button onclick="goto('stepSuccess', this)">MEH</button>
        <button onclick="goto('stepFailure', this)">I HATE IT</button>
    </span>
</p>
<p class="step" id="stepSuccess">
<span class="border success">Cram that ice cream in your face!<br />
<button onclick="reset('stepHungry')">Reset</button></span>
</p>
<p class="step" id="stepFailure">
<span class="border fail">You should probably not eat ice cream.<br />
<button onclick="reset('stepHungry')">Reset</button></span>
</p>

---
layout: post
title:  'Using Git as SVN client'
date:   2015-09-07 09:35:00
tags: ['git', 'svn']
---

When I switched over to Git, the feature I loved most was the possibility of creating local branches. With SVN I used to create and apply patches on my project if I needed to switch from implementing a complex feature to quickly fixing a bug. Of course, a patch does not have any progress history and merging it back into the main project can become difficult as the code base progresses. Merging Git local branches can also be difficult if the feature branch diverges for too long from the main branch, but you have a local development history and most of the time you will be able to painlessly rebase the feature branch on the main branch.

<!--more-->

Checking out an SVN project with Git
---

You will need the address of the SVN repository for this; let's say the address is "http://svn.yourserver.com/repos/trunk/yourproject". The command you need to run is:

~~~
git svn clone http://svn.yourserver.com/repos/trunk/yourproject
~~~

If you are checking out a large project, with a long history, you may have to wait a while for this command to finish executing. Git converts the whole SVN project history into its own format locally. I've sometimes had to wait for over 9 hours for this clone action to finish. Make sure your computer won't go to sleep and leave it running over night.

Once you have a local copy of the project, edit or add your ".gitignore" file in the root folder of the project. Exclude from versioning target folder, IDE project files, package files; like so:

~~~
*.class

# Package Files #
*.war
*.ear
/bin
/build
/.gradle
*target*
*/.idea/*
/.idea/workspace.xml
/.idea
*.iml
.gitignore
~~~

Updating local repository
---

To download the latest SVN changes to your local Git project, use the following command:

~~~
git svn rebase
~~~

You may want to make sure you are on the master branch before doing this, so you can also run this command before rebasing the project:

~~~
git checkout master
~~~

Checking in
---

To check in your local commits to the SVN repository, run:

~~~
git svn dcommit
~~~

This operation may also take a while, depending on how many changes you have locally. Make sure your master branch is synced with the SVN repository before you commit any changes.

Working with private branches
---

When you start working on a new task, you can create a private branch for that task:

~~~
git checkout -b nameForNewTaskBranch
~~~

You can now work on this branch, commit as many changes as you like, and quickly switch to the master branch when you need to handle some other task, like an urgent bug fix.

Once your new task is done, you can merge your private branch back into the main branch and send your changes to the SVN repository. You can do this in two ways: rebase your changes or merge your changes.

The rebase approach will move the commits on your private branch on the top of the master branch. First you must check out the master branch and update it. After the master branch is up to date, you must switch back to the private branch. Now you have to rebase the changes in your private branch on top of the master branch. Once this is done, switch back to the master branch and merge the master branch with your private branch. This operation will "fast-forward" your master branch (bringing the head of the master branch) to your latest commit. Now you can check in the code to SVN.

~~~
git checkout master
git svn rebase
git checkout nameForNewTaskBranch
git rebase master
git checkout master
git merge nameForNewTaskBranch
git svn dcommit
~~~

The second approach is to merge your master branch with the private branch. Merging will move the private branch commits to the master branch while keeping the chronological of private and master branch commits (the commits will interweave). I favor the rebase approach and that is the approach I have used. Possible conflict resolution can be easier when you place all your commits on top of the existing code, while the merge approach can bring out multiple conflinct points across the history of the project codebase. But if you still want to do a merge you won't have to go through so many steps as for the rebase approach. First update your master branch, then you can merge the master branch with the private branch, and finally check in to SVN.

~~~
git checkout master
git merge nameForNewTaskBranch
git svn dcommit
~~~

That is all there is to it. It's possible to still have local private branches even if you're using SVN as your versioning control system.

# Running a Python Build Inside Docker

On a project I was working recently we had to update our Python version from 3.8 to 3.12, to take advantage of some new libraries and account for the fact that Python 3.8 is already considered outdated.

Our project consists of several microservices released as Docker images, but some of those services will share a Python library which is build and released as a `.whl` archive. Switching the Python version at build for the Docker images was simple enough, since we used multistage Docker files, so we only had to upgrade the Python version in the build Docker image.

However, for our library build we were not leveraging this virtualization approach, we built the library directly on the build system agent VM; and this VM had a Python 3.11 installed, was not able to build a project relying on Python 3.12, and since we are not managing the build system VM and nobody from that team was available to help, we had to find another solution.

But since we already had Docker installed on the build VM, using a Docker container to also build the library looked like the correct approach. This way, we would no longer be dependent on the particularities of the build VM and we could also switch to a different build system easily in the future.

## Approach

The complication when building some artefacts inside a Docker image, as opposed to the Docker image itself being the artefact, is how do we get access to those artefacts? There are two possible approaches with Docker:

1. start a Docker container with all necessary build dependencies, mount the project folder in the container and run the build inside there, then stop the Docker container and, since the project folder was mounted, the resulting artefacts should now be available in the project folder;
2. build a Docker image in which we install the necessary build dependencies, copy the necessary project files, and run the project build during the Docker image build; we then just need to somehow copy out the resulting artefacts from the Docker image.

We tried the first approach but ran into some problems, main one being the inconsistency with mounting the project folder when working with several layers of virtualization, like when using devcontainers. It also required the existence of a custom Docker image with all necessary build dependencies, which we had to build before we could start the Docker container and run the actual project build inside it. A third problem was the resulting build artefacts permissions; unless the devcontainer/linux system used for development and the Docker image used to run the build did not have aligned users, the resulting build artefacts might have different permissions and not be accessible in the dev environment after the successful build process.

The second approach turned our to be simpler and more consistent. We just had to build a Docker image, copy necessary project files inside the Docker image, run our library build at Docker build time. And the last problem of copying out the resulting artefacts was simpler than I expected, we did not have to start a Docker image and keep it running, we could just create a Docker volume from the resulting image and copy the files from the volume. This makes sense, since Docker images are just layers of file systems, but it was the first time I used this approach and it turned out to work very well.

## Steps

Here I am documenting the steps to achive this build process.

First, our project is a simple Python project with the following structure:

- we have a `libcode` folder containing all the Python files/packages
- we have a `requirements.txt` file with our dependecies
- we have a `setup.py` file which defines how the library is built into a wheel file
- we also have a `version_update.py` file which we must run at build time to determine how the semantic version of the library will change based on the commit message format

Considering this, the `Dockerfile.build` will look as follows:

``` Dockerfile
FROM python:3.12-trixie

ARG COMMIT_MESSAGE

WORKDIR /workspace

COPY libcode libcode
COPY requirements.txt requirements.txt
COPY setup.py setup.py
COPY version_update.py version_update.py

RUN pip install -r requirements.txt --no-input
RUN pip install wheel --no-input
RUN pip install build --no-input

RUN python3 version_update.py
RUN python3 -m build
```

The sections and steps are clear. One input argument will be the commit message, which will be used in the `version_update.py` file to determine and update the new version for this build. This version will be updated inside the `setup.py` file before we run the build process and obtain the packages. We must create a folder where we will copy our code, the `/workspace` folder. We copy all the relevant code files. Then we install the project dependencies from `requirements.txt`, and also some build dependencies. We then run the version update and at the end run the build. This build command will create a new folder under the `/workspace` folder, named `dist`, which will contain our artefacts.

And following are the commands we must include in our CICD build pipeline definition:


``` bash
docker build -f Dockerfile.build -t librarybuild . --build-arg COMMIT_MESSAGE=$COMMIT_MESSAGE
rm -rf dist && mkdir dist
VOLUME_ID=$(docker create librarybuild) && docker cp $VOLUME_ID:/workspace/dist/. ./dist/ && docker cp $VOLUME_ID:/workspace/setup.py ./ && docker rm -v $VOLUME_ID
```

Here, we first run the Docker build, and we provide the `$COMMIT_MESSAGE` argument (obtained previously in our CICD build pipeline from GIT). Next, we clear a potentially existing `dist` folder. The final line will execute four commands:

- we create a volume from the Docker image we build previously and save the volume id; we need to do this step so we can access the file system which resulted from the Docker build process;
- we then copy from inside the volume the entire `dist` folder, to our local `dist` folder; inside it are our build artefacts (the `.whl` file);
- we also copy the modified `setup.py` file; this file was modified by `version_update.py`, so it has an updated version, and we want to save this updated version in GIT at the end of the build pipeline;
- finally, we clean things up, we delete the volume we created in the first command.

With this new process we can now build any kinds of artefacts, not just Docker images, through Docker virtualization. In the future we can easily upgrade/switch versions without having to immediately upgrade the build system VM.
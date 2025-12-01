# Local Setup

## Prerequisites
- Node.js (recommended version 18.x or higher)
- npm (included with Node.js)
- Docker (installed and the daemon running)

## How to run the project
1. Make sure Docker is running.
2. In your terminal, navigate to the root of the project.
3. Run the following command:
	```sh
	npm run docker:dev
	```

This command uses Docker Compose to start all the required services for development.

## API Requests Collection

There is a folder named `bruno-test` in the root of the project. This folder contains a collection of API requests (in Bruno format) that can be used to test and interact with the available endpoints.

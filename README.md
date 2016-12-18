# mdl-sync

This project is developed to batch document retrieval from Mendeley API (MAPI). MAPI requires oauth2 authentication followed by access token request in order to get private documents, and we need to periodically update these documents. The [authorization code flow] (http://dev.mendeley.com/reference/topics/authorization_auth_code.html) is required for private documents but it also requires interactions with browser, which is not possible on a server. Therefore a headless browser is used for submitting the authenticationi form.

### Dependencies
1. Nodejs
2. PhantomJS
3. CasperJS

### Installation
1. Install both PhantomJS and CasperJS. This can be achieved by `npm install phantomjs casperjs` but don't mixed them with typical nodejs modules. On macOS both are available with Homebrew.
1. `git clone` this project.
1. `cd mdl-sync`; `npm install`

### To get Mendeley documents
Run `./getDocuments.sh`

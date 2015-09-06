Spring Remoting is a wonderful tool for seamlessly connecting Java services. However, in practice I have run into some inelegant practices when managing expensive tasks run through remoting. The premise is you have a service that runs a complex, expensive operation. To prevent stressing the service too much, limits may be imposed on how many calls a user is allowed to make to that service. For example, a user will be allowed to start three calls to the service, before being blocked until the result of those calls is returned. It may make more sense for the user to cancel the calls they no longer want to wait for, and this is the mechanism I will explore in this post. I plan of implementing a way of interrupting expensive calls made through spring remoting.

A basic spring remoting setup
---

Introducting interrupt checks in the service
---

Sending interrupt checks through spring remoting
--- 

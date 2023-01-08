Indentation enhances understanding when doing a quick scan of code (just ask any Python developer :grinning:).  
When you create run-on statements (based on column width) you risk mis-understandings.

Glance at the code below in a narrow browser tab and then again in a wide one (be sure you can see the far right side this time).
```typescript
// ... many lines of complex business logic
try {
	if (response.statusCode >= 200 && response.statusCode < 300 && Array.isArray(response.data?.data) && response.data!.data.length > 0) return this.serializeResonseToXml(resonse.data!.data[0]);
	return null;
}
catch (error) {
	console.log('an error');
}
```

Some argue that we should ignore modern screen advances and pretend we still live in an 80 column world.
Still others, argue that we all have 43" monitors these days.

But what if you are on a smaller screen, or happen to open the file in a smaller portlet / tab?

One size does not fit all!

It is true that this particular scenario might be prevented by strictly adhering to brace placement.  
It is also true that by carefully reading the code, some might notice that the `if` and 
the `return` are at the same indentation level, **and** since they are **certain** the code has already been formatted, 
they will "safely" assume there is an unseen `return` statement offscreen to the right.  

**But honestly**, do you want to be thinking about how to keep your formatter from degrading the readability of your code when you are 12 layers deep in complex business logic?

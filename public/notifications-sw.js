self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{return;}
 const url=new URL(data.url||'/',self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(self.registration.showNotification(data.title||'TaskHarbor',{body:data.body||'You have an update.',tag:data.tag||'taskharbor',data:{url:url.href}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=new URL(event.notification.data?.url||'/',self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(self.clients.openWindow(url.href));
});

/* TaskHarbor category-aware submission forms. Evidence still uses existing review API. */
(function (root) {
  'use strict';
  const FORMATS = Object.freeze({
    ai: {
      title: 'AI evaluation',
      hint: 'Evaluate the assigned example using the project instructions. Do not paste unrelated private content.',
      fields: [
        {name:'reference',label:'Example or item reference',type:'text',max:150},
        {name:'decision',label:'Evaluation',type:'select',options:['Response A preferred','Response B preferred','Both acceptable','Neither acceptable','Not applicable']},
        {name:'rating',label:'Quality rating',type:'select',options:['1 - Poor','2 - Needs improvement','3 - Fair','4 - Good','5 - Excellent']},
        {name:'reason',label:'Reason and rubric evidence',type:'textarea',max:3500}
      ]
    },
    transcription: {
      title: 'Transcription',
      hint: 'Use speaker names and timestamps when required by this assignment. Only transcribe audio you are authorized to access.',
      fields: [
        {name:'clip',label:'Audio clip or assigned item reference',type:'text',max:150},
        {name:'language',label:'Language',type:'text',max:100},
        {name:'transcript',label:'Transcript with speaker labels and timestamps where requested',type:'textarea',max:8000}
      ]
    },
    annotation: {
      title: 'Data annotation',
      hint: 'Use the labels and acceptance criteria in the task instructions. Do not identify private individuals unless authorized.',
      fields: [
        {name:'item',label:'Item or batch reference',type:'text',max:150},
        {name:'labels',label:'Assigned labels / classifications',type:'textarea',max:4200},
        {name:'explanation',label:'Quality notes',type:'textarea',max:1500,optional:true}
      ]
    },
    project: {
      title: 'Skilled project milestone',
      hint: 'Submit only work completed for this task. Links must point to deliverables you have permission to share.',
      fields: [
        {name:'milestone',label:'Milestone or deliverable name',type:'text',max:180},
        {name:'url',label:'Deliverable URL (optional)',type:'url',max:700,optional:true},
        {name:'summary',label:'Work delivered and verification steps',type:'textarea',max:5800}
      ]
    }
  });
  const drafts = new Map();
  function format(task) {
    const category = String(task?.category || '').toLowerCase();
    return FORMATS[category] || null;
  }
  function validateResult(category, values) {
    const form = FORMATS[category];
    if (!form) throw Error('Unsupported work type');
    const result = {};
    for (const field of form.fields) {
      const value = String(values[field.name] ?? '').trim();
      if (!field.optional && !value) throw Error(field.label + ' is required');
      if (value.length > (field.max || 1000)) throw Error(field.label + ' is too long');
      if (field.type === 'select' && !field.options.includes(value)) throw Error('Choose a valid ' + field.label.toLowerCase());
      if (field.type === 'url' && value) {
        let u;
        try { u = new URL(value); } catch { throw Error('Use a valid deliverable URL'); }
        if (!['https:','http:'].includes(u.protocol)) throw Error('Only http(s) deliverable links are accepted');
      }
      result[field.name] = value;
    }
    const serialized = JSON.stringify({schema:'taskharbor.work.v1',category,answers:result});
    if (serialized.length > 9500) throw Error('Submission exceeds the task evidence limit; shorten your response');
    return serialized;
  }
  function node(doc, tag, cls, label) {
    const item = doc.createElement(tag);
    if (cls) item.className = cls;
    if (label != null) item.textContent = label;
    return item;
  }
  function renderField(doc, field, value) {
    const label = node(doc,'label','work-field');
    const name = node(doc,'span','',field.label);
    label.append(name);
    let control;
    if (field.type === 'select') {
      control = node(doc,'select');
      const blank = node(doc,'option','', 'Choose an option');
      blank.value = '';
      control.append(blank);
      for (const option of field.options) {
        const element = node(doc,'option','',option);element.value=option;control.append(element);
      }
    } else control = node(doc,field.type === 'textarea' ? 'textarea' : 'input');
    if (field.type !== 'textarea' && field.type !== 'select') control.type=field.type;
    control.name=field.name;
    control.required=!field.optional;
    if (field.max) control.maxLength=field.max;
    if (field.type === 'textarea') control.rows=field.name==='transcript'?9:4;
    if (value) control.value=value;
    label.append(control);
    return label;
  }
  async function readImages(input) {
    const files = [...(input.files || [])];
    if (files.length > 6) throw Error('Choose no more than six evidence images');
    const result=[];
    for (const file of files) {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('Only PNG, JPEG and WebP evidence is supported');
      if (file.size > 3*1024*1024) throw Error('Each evidence image must be 3 MB or smaller');
      const data = await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result).split(',')[1]);
        reader.onerror=()=>reject(Error('Could not read evidence image'));
        reader.readAsDataURL(file);
      });
      result.push({data});
    }
    return result;
  }
  function open(task, handler) {
    const spec=format(task);
    if (!spec) return false;
    if (task.status !== 'claimed') throw Error('Claim the task before submitting evidence');
    const doc=root.document;
    if (!doc?.body) throw Error('Worker interface is unavailable');
    doc.getElementById('work-task-dialog')?.remove();
    const overlay=node(doc,'div','work-overlay');
    overlay.id='work-task-dialog';
    const dialog=node(doc,'section','work-dialog');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','work-dialog-title');
    const title=node(doc,'h2','',spec.title + ' · ' + task.title);
    title.id='work-dialog-title';
    const caption=node(doc,'p','work-hint',spec.hint);
    const form=node(doc,'form','work-submission');
    const saved=drafts.get(task.id)||{};
    spec.fields.forEach(field=>form.append(renderField(doc,field,saved[field.name]||'')));
    const fileLabel=node(doc,'label','work-field','Evidence images (optional; up to 6 images, 3 MB each)');
    const imageInput=node(doc,'input');
    imageInput.type='file';imageInput.accept='image/png,image/jpeg,image/webp';imageInput.multiple=true;
    fileLabel.append(imageInput);form.append(fileLabel);
    const status=node(doc,'p','work-status');
    status.setAttribute('role','status');
    const actions=node(doc,'div','work-actions');
    const submit=node(doc,'button','', 'Submit work for review');
    submit.type='submit';
    const cancel=node(doc,'button','secondary','Save draft and close');
    cancel.type='button';
    actions.append(submit,cancel);
    form.append(status,actions);
    dialog.append(title,caption,form);
    overlay.append(dialog);
    const previousFocus=doc.activeElement;
    const saveDraft=()=>drafts.set(task.id,Object.fromEntries(new FormData(form)));
    const close=()=>{saveDraft();overlay.remove();doc.removeEventListener('keydown',escape);previousFocus?.focus?.();};
    cancel.addEventListener('click',close);
    form.addEventListener('input',saveDraft);
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    const escape=event=>{if(event.key==='Escape'){close();doc.removeEventListener('keydown',escape);}};
    doc.addEventListener('keydown',escape);
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled=true;cancel.disabled=true;status.textContent='Validating work…';
      try {
        const answers=Object.fromEntries(new FormData(form));
        const content=validateResult(task.category,answers);
        const images=await readImages(imageInput);
        status.textContent='Submitting your work securely…';
        await handler.submit({taskId:task.id,content,images});
        drafts.delete(task.id);
        overlay.remove();
        doc.removeEventListener('keydown',escape);
      } catch (error) {
        status.textContent=error.message || 'Submission failed. Your draft remains in this page.';
        saveDraft();
      } finally {submit.disabled=false;cancel.disabled=false;}
    });
    doc.body.append(overlay);
    form.querySelector('input,select,textarea')?.focus();
    return true;
  }
  root.TaskHarborWorkspaces={ supports:task=>!!format(task), open, validateResult, format };
})(globalThis);

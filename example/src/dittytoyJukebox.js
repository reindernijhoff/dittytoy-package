import {Dittytoy} from 'dittytoy';

export default class DittytoyJukebox {
  constructor() {
    this.dittytoy = new Dittytoy();
    console.log(this.dittytoy);

    this.fetchDitties();
  }

  async playDitty(id) {
    const ditty = await fetch(`https://dittytoy.net/api/v1/ditty/${id}/`).then( e => e.json() ).then(async(ditty) => {
      await this.dittytoy.stop();
      await this.dittytoy.compile(ditty.code);
      await this.dittytoy.play();
    });
  }

  async fetchDitties() {
    fetch('https://dittytoy.net/api/v1/ditty/browse/love/').then( e => e.json() ).then( data => {
      const maxDitties = 40;
      const ul = document.getElementById('ditties');

      for (let i = 0; i < Math.min(data.objects.length, maxDitties); i++) {
        const ditty = data.objects[i];
        ul.innerHTML += `<li data-id="${ditty.object_id}">${ditty.title} by ${ditty.user_id}</li>`;
      }
      document.querySelectorAll("#ditties li").forEach(item => {
        item.addEventListener('click', event => {
          document.querySelectorAll("#ditties li").forEach(el => {
            el.classList.remove("selected");
          });
          event.target.classList.add("selected");
          this.playDitty(event.target.getAttribute('data-id'));
        });
      });
    });
  }
}
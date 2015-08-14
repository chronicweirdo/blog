module Reading
  class Generator < Jekyll::Generator
    def generate(site)
      ongoing = 1
      done = 2

      reading = site.pages.detect {|page| page.name == 'reading.html'}
      reading.data['ongoing'] = ongoing
      reading.data['done'] = done
    end
  end
end
